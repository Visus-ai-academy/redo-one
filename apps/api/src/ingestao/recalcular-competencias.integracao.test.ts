import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../database/database';
import * as schema from '../database/schema';
import { DrizzleCompetenciasRepository } from '../faturamento/infrastructure/persistence/drizzle-competencias.repository';
import { DrizzleCortesRepository } from '../faturamento/infrastructure/persistence/drizzle-cortes.repository';
import { RecalcularCompetencias } from './application/use-cases/recalcular-competencias';
import type { LaudoPreparado } from './domain/preparar-laudo';
import { DrizzleLaudosRepository } from './infrastructure/persistence/drizzle-laudos.repository';

// Do corte gravado no banco à competência dos laudos: repositórios Drizzle e o Postgres de teste.
const url = process.env.TEST_DATABASE_URL;

/** Exame em 05/10 e laudo em 20/10 (Brasília): pelo padrão, 2026-10. */
const laudo = (identidade: string, clienteId: string, competencia = '2026-10'): LaudoPreparado => ({
  identidade,
  hashConteudo: `h-${identidade}`,
  origem: 'normal',
  empresaOrigem: 'CLINICA',
  clienteId,
  unidadeId: null,
  accessionNumber: identidade,
  pacienteChave: 'p',
  estudo: 'TC TORAX',
  exameId: null,
  modalidadeOrigem: 'CT',
  modalidadeId: null,
  especialidadeOrigem: null,
  especialidadeId: null,
  categoriaId: null,
  prioridadeOrigem: 'Rotina',
  prioridadeId: null,
  medicoOrigem: null,
  medicoId: null,
  medicoReassinaturaOrigem: null,
  medicoReassinaturaId: null,
  medicoIdMobilemed: null,
  medicoReassinaturaIdMobilemed: null,
  valores: 1,
  volume: 1,
  status: 'Assinado',
  duplicado: false,
  complementar: false,
  dataRealizacao: new Date('2026-10-05T11:00:00Z'),
  dataTransferencia: null,
  dataLaudo: new Date('2026-10-20T17:00:00Z'),
  dataPrazo: null,
  dataReassinatura: null,
  diaLaudo: '2026-10-20',
  competencia,
  pecas: [],
  paciente: null,
});

describe.skipIf(!url)('recalcular competências (integração)', () => {
  let pool: Pool;
  let db: Database;
  let clienteX: string;
  let clienteY: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table competencias, cortes_competencia, laudos, totais_laudos_dia, importacoes,
        arquivos, clientes cascade`,
    );
    const [x, y] = await db
      .insert(schema.clientes)
      .values([
        { nome: 'X', chaveNormalizada: 'x' },
        { nome: 'Y', chaveNormalizada: 'y' },
      ])
      .returning({ id: schema.clientes.id });
    clienteX = x?.id ?? '';
    clienteY = y?.id ?? '';
    const [arquivo] = await db
      .insert(schema.arquivos)
      .values({ chave: 'a.xlsx', nomeOriginal: 'a.xlsx', tipoConteudo: 'x', contexto: 'ingestao' })
      .returning();
    const [importacao] = await db
      .insert(schema.importacoes)
      .values({ arquivoId: arquivo?.id ?? '', origem: 'upload_manual' })
      .returning();
    // Mais de um lote (5.000) do cliente X, um dele em competência fechada e um do cliente Y.
    await new DrizzleLaudosRepository(db).aplicar(
      importacao?.id ?? '',
      { origem: 'normal', inicio: '2026-10-20', fim: '2026-10-20', competenciasBloqueadas: [] },
      {
        inserir: [
          ...Array.from({ length: 5001 }, (_, i) => laudo(`x${i}`, clienteX)),
          laudo('fechado', clienteX, '2026-09'),
          laudo('y', clienteY),
        ],
        atualizar: [],
        classificacoes: new Map(),
        remover: [],
        linhasBrutas: new Map(),
        pacientes: new Map(),
        idsMedico: new Map(),
      },
      new Date('2026-10-21T12:00:00Z'),
    );
    await db.insert(schema.competencias).values({ competencia: '2026-09', status: 'fechada' });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('o corte gravado do cliente leva os laudos dele à nova competência, que ganha linha', async () => {
    // Até o dia 15, no próprio mês, sem olhar o exame: o laudo de 20/10 vai para 2026-11.
    await db.insert(schema.cortesCompetencia).values({
      clienteId: clienteX,
      desde: '2026-10',
      dia: 15,
      mes: 'proprio',
      consideraExame: false,
    });
    const recalcular = new RecalcularCompetencias(
      new DrizzleLaudosRepository(db),
      new DrizzleCompetenciasRepository(db),
      new DrizzleCortesRepository(db),
      () => new Date('2026-11-24T12:00:00Z'),
    );

    expect(await recalcular.executar({ clienteIds: [clienteX] })).toEqual({
      lidos: 5001,
      alterados: 5001,
    });
    expect(await recalcular.executar({ clienteIds: [clienteX] })).toEqual({
      lidos: 5001,
      alterados: 0,
    });

    const porCompetencia = await db.execute<{ competencia: string; total: number }>(
      sql`select competencia, count(*)::int as total from laudos group by competencia order by 1`,
    );
    expect(porCompetencia.rows).toEqual([
      { competencia: '2026-09', total: 1 },
      { competencia: '2026-10', total: 1 },
      { competencia: '2026-11', total: 5001 },
    ]);
    const [y] = await db.select().from(schema.laudos).where(sql`identidade = 'y'`);
    expect(y?.competencia).toBe('2026-10');
    const linhas = await db
      .select()
      .from(schema.competencias)
      .orderBy(schema.competencias.competencia);
    expect(linhas.map((c) => [c.competencia, c.status])).toEqual([
      ['2026-09', 'fechada'],
      ['2026-11', 'aberta'],
    ]);
  });
});
