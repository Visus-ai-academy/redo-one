import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleLaudosCompetencia } from './drizzle-laudos-competencia';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleLaudosCompetencia', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleLaudosCompetencia;
  let x: string;
  let y: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    repo = new DrizzleLaudosCompetencia(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table laudos, importacoes cascade`);
    const nome = () => `CLIENTE_PREVIA_${Math.random()}`;
    const [a, b] = await db
      .insert(schema.clientes)
      .values([nome(), nome()].map((n) => ({ nome: n, chaveNormalizada: n })))
      .returning();
    x = a?.id ?? '';
    y = b?.id ?? '';
    const [importacao] = await db
      .insert(schema.importacoes)
      .values({ origem: 'mobilemed' })
      .returning();
    const laudo = (i: number, clienteId: string | null, competencia: string, removido = false) => ({
      id: `00000000-0000-0000-0000-00000000000${i}`,
      identidade: `previa-${i}`,
      hashConteudo: 'h',
      importacaoId: importacao?.id ?? '',
      origem: 'normal' as const,
      empresaOrigem: 'CLINICA',
      clienteId,
      pacienteChave: 'p',
      estudo: 'TC',
      modalidadeOrigem: 'CT',
      prioridadeOrigem: 'Rotina',
      volume: 1,
      status: 'Assinado',
      dataRealizacao: new Date('2026-10-05T12:00:00Z'),
      dataLaudo: new Date('2026-10-20T12:00:00Z'),
      diaLaudo: '2026-10-20',
      competencia,
      removidoEm: removido ? new Date() : null,
    });
    await db
      .insert(schema.laudos)
      .values([
        laudo(1, x, '2026-09'),
        laudo(2, x, '2026-10'),
        laudo(3, x, '2026-11'),
        laudo(4, y, '2026-10'),
        laudo(5, null, '2026-10'),
        laudo(6, x, '2026-10', true),
        laudo(7, x, '2026-12'),
      ]);
  });

  afterAll(async () => {
    await db.execute(sql`truncate table laudos, importacoes cascade`);
    await db.delete(schema.clientes).where(sql`${schema.clientes.nome} like 'CLIENTE_PREVIA_%'`);
    await pool.end();
  });

  const ids = (l: { id: string }[]) => l.map((v) => Number(v.id.slice(-1)));

  it('do cliente, a partir de desde, fora das bloqueadas e sem os removidos, só as colunas da conta', async () => {
    const lote = await repo.lerParaPrevia({
      clienteId: x,
      aPartirDe: '2026-10',
      competenciasBloqueadas: ['2026-11'],
      depoisDe: null,
      limite: 10,
    });

    expect(ids(lote)).toEqual([2, 7]);
    expect(lote[0]).toEqual({
      id: '00000000-0000-0000-0000-000000000002',
      clienteId: x,
      dataRealizacao: new Date('2026-10-05T12:00:00Z'),
      dataLaudo: new Date('2026-10-20T12:00:00Z'),
      competencia: '2026-10',
    });
  });

  it('sem cliente, lê todos (inclusive sem cliente), em lotes pelo id', async () => {
    const pedido = { clienteId: null, aPartirDe: '2026-10', competenciasBloqueadas: [], limite: 2 };
    const primeiro = await repo.lerParaPrevia({ ...pedido, depoisDe: null });
    const segundo = await repo.lerParaPrevia({ ...pedido, depoisDe: primeiro[1]?.id ?? null });
    const terceiro = await repo.lerParaPrevia({ ...pedido, depoisDe: segundo[1]?.id ?? null });

    expect([ids(primeiro), ids(segundo), ids(terceiro)]).toEqual([[2, 3], [4, 5], [7]]);
  });
});
