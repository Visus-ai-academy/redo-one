import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleConfiguracaoDistribuicaoRepository } from './drizzle-configuracao-distribuicao.repository';

const url = process.env.TEST_DATABASE_URL;
const PASTA = resolve(__dirname, '../../../../drizzle');
/** A última migration com a coluna `recolhimento_apos_lista_min`. */
const ANTES = '0059_corte_exame_restricoes';

/** Cópia da pasta de migrations só até `tag` (o diário cortado ali). */
function migrationsAte(tag: string): string {
  const pasta = mkdtempSync(join(tmpdir(), 'migrations-'));
  cpSync(PASTA, pasta, { recursive: true });
  const diario = join(pasta, 'meta', '_journal.json');
  const j = JSON.parse(readFileSync(diario, 'utf8')) as { entries: { tag: string }[] };
  const fim = j.entries.findIndex((e) => e.tag === tag);
  writeFileSync(diario, JSON.stringify({ ...j, entries: j.entries.slice(0, fim + 1) }));
  return pasta;
}

/**
 * O prazo da Lista (coluna) vira o prazo próprio de cada turno do tipo Lista: num banco novo, migra
 * até antes da troca, grava a configuração antiga e migra o resto.
 */
describe.skipIf(!url)('migration do prazo do recolhimento por turno (banco)', () => {
  const nome = `migr_recolh_${process.pid}_${Date.now()}`;
  let admin: Pool;
  let pool: Pool;
  let antes = '';

  beforeAll(async () => {
    admin = new Pool({ connectionString: url });
    await admin.query(`create database "${nome}"`);
    const u = new URL(url ?? '');
    u.pathname = `/${nome}`;
    pool = new Pool({ connectionString: u.toString() });
    antes = migrationsAte(ANTES);
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`drop database if exists "${nome}" with (force)`);
    await admin?.end();
    if (antes) rmSync(antes, { recursive: true, force: true });
  });

  it('copia o prazo da Lista para cada turno do tipo Lista e tira a coluna', async () => {
    const db = drizzle({ client: pool });
    await migrate(db, { migrationsFolder: antes });
    const turno = async (nomeTurno: string, tipo: 'fixo' | 'lista') => {
      const r = await db.execute<{ id: string }>(
        sql`insert into turnos (nome, tipo, horario_inicio, horario_fim)
            values (${nomeTurno}, ${tipo}, '07:00', '07:00') returning id`,
      );
      return r.rows[0]?.id ?? '';
    };
    const lista = await turno('Lista', 'lista');
    const listaNoite = await turno('Lista noite', 'lista');
    await turno('Tarde', 'fixo');
    await db.execute(sql`
      insert into configuracao_distribuicao (
        ordem_fila, agrupar_por_paciente, janela_paciente_horas, tolerancia_acima_teto,
        margem_urgencia_pct, folga_proporcao_pct, prazo_critico_min, antecedencia_periodo_min,
        ciclo_minutos, marcadores_equilibrio, escala_restringe_especialidade, dias_ja_entregue,
        recolhimento_apos_turno_min, recolhimento_apos_lista_min
      ) values (
        '[{"criterio":"prazo","direcao":"asc"}]', true, 0, 0, 10, 20, 60, 180, 30, '{}', true, 7,
        60, 720
      )`);

    await migrate(db, { migrationsFolder: PASTA });

    const c = await new DrizzleConfiguracaoDistribuicaoRepository(db as never).obter();
    expect(c?.recolhimentoAposTurnoMin).toBe(60);
    expect(c?.recolhimentoPorTurno).toEqual(
      [
        { turnoId: lista, minutos: 720 },
        { turnoId: listaNoite, minutos: 720 },
      ].sort((a, b) => (a.turnoId < b.turnoId ? -1 : 1)),
    );
    const colunas = await db.execute(sql`
      select 1 from information_schema.columns
      where table_name = 'configuracao_distribuicao' and column_name = 'recolhimento_apos_lista_min'`);
    expect(colunas.rows).toEqual([]);
  });
});
