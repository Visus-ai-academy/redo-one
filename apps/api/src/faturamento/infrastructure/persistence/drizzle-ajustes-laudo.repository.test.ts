import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleAjustesLaudoRepository } from './drizzle-ajustes-laudo.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleAjustesLaudoRepository', () => {
  let pool: Pool;
  let db: Database;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    await runMigrations({ pgPool: pool });
    await db.execute(sql`truncate table ajustes_laudo_faturamento, laudos, importacoes cascade`);
    await db.execute(sql`delete from graphile_worker._private_jobs`);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('cria, troca (encerra o anterior), encerra e lista o histórico com os nomes', async () => {
    const repo = new DrizzleAjustesLaudoRepository(db);
    const [u] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Ana', email: `ajustes-${Math.random()}@exemplo.com` })
      .returning();
    const [imp] = await db
      .insert(schema.importacoes)
      .values({ origem: 'mobilemed', formato: 'laudos' })
      .returning();
    const [l] = await db
      .insert(schema.laudos)
      .values({
        identidade: `aj-${Math.random()}`,
        hashConteudo: 'h',
        importacaoId: imp?.id as string,
        origem: 'normal',
        empresaOrigem: 'X',
        pacienteChave: 'p',
        estudo: 'E',
        modalidadeOrigem: 'MR',
        prioridadeOrigem: 'R',
        volume: 1,
        status: 'Assinado',
        dataRealizacao: new Date(),
        dataLaudo: new Date(),
        diaLaudo: '2026-10-03',
        competencia: '2026-10',
      })
      .returning();
    const laudo = await repo.obterLaudo(l?.id as string);
    expect(laudo).toMatchObject({ id: l?.id, competencia: '2026-10' });
    const autor = { usuarioId: u?.id as string, em: new Date('2026-11-26T10:00:00Z') };
    const um = await repo.criar(
      { laudo: laudo as never, tipo: 'excluir', valorUnitarioCentavos: null, motivo: 'teste' },
      autor,
      null,
    );
    const dois = await repo.criar(
      { laudo: laudo as never, tipo: 'valor', valorUnitarioCentavos: 1234, motivo: 'acordo' },
      { ...autor, em: new Date('2026-11-26T11:00:00Z') },
      'Trocado por outro ajuste: acordo',
    );
    expect((await repo.vigente(laudo?.identidade as string))?.id).toBe(dois);
    expect(await repo.encerrar(dois, 'engano', autor)).toBe(true);
    expect(await repo.encerrar(dois, 'de novo', autor)).toBe(false);
    const lista = await repo.listar('2026-10');
    expect(lista.map((a) => [a.id, a.criadoPor, a.encerradoPor, a.motivoEncerramento])).toEqual([
      [dois, 'Ana', 'Ana', 'engano'],
      [um, 'Ana', 'Ana', 'Trocado por outro ajuste: acordo'],
    ]);
    expect(lista[0]?.laudoId).toBe(l?.id);
  });
});
