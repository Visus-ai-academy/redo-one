import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleListaRepository } from '../../catalogo/listas/drizzle-lista.repository';
import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { TABELA_TIPOS_AUSENCIA } from './tabela';
import type { DadosTipoAusencia } from './tipos-ausencia.service';

// Roda contra um Postgres de verdade; sem TEST_DATABASE_URL, fica "skipped".
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('tipos de ausência no repositório das listas', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleListaRepository<DadosTipoAusencia>;

  const tipo = (nome: string, extra: Partial<DadosTipoAusencia> = {}): DadosTipoAusencia => ({
    nome,
    gravidade: 0,
    soGestor: false,
    contaComoFalta: false,
    descricao: null,
    cor: null,
    ordem: 0,
    ativo: true,
    ...extra,
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    repo = new DrizzleListaRepository<DadosTipoAusencia>(db, TABELA_TIPOS_AUSENCIA);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table tipos_ausencia, medicos cascade`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('grava, edita e lê as colunas a mais', async () => {
    const id = await repo.criar(tipo('Falta', { gravidade: 3, contaComoFalta: true }));
    await repo.atualizar(id, tipo('Falta', { gravidade: 4, soGestor: true, contaComoFalta: true }));

    expect(await repo.buscar(id)).toEqual({
      id,
      ...tipo('Falta', { gravidade: 4, soGestor: true, contaComoFalta: true }),
    });
    expect((await repo.listar({ pagina: 1, porPagina: 10 })).itens).toHaveLength(1);
    expect(await repo.buscarPorNome('FALTA')).toEqual({ id });
  });

  it('não exclui tipo usado por uma ausência', async () => {
    const id = await repo.criar(tipo('Férias'));
    const [medico] = await db
      .insert(schema.medicos)
      .values({ nome: 'Ana Reis', chaveNormalizada: 'ana reis' })
      .returning();
    await db.insert(schema.ausencias).values({
      medicoId: medico?.id ?? '',
      tipoId: id,
      dataInicio: '2026-12-01',
      dataFim: '2026-12-10',
    });

    expect(await repo.excluir(id)).toBe(false);
    const livre = await repo.criar(tipo('Folga'));
    expect(await repo.excluir(livre)).toBe(true);
  });
});
