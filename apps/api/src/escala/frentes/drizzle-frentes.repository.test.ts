import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { DrizzleFrentesRepository } from './drizzle-frentes.repository';
import { garantirFrentes } from './garantir-frentes';

// Roda contra um Postgres de verdade; sem TEST_DATABASE_URL, fica "skipped".
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleFrentesRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleFrentesRepository;
  let neuro: string;
  let msk: string;
  let ct: string;
  let rx: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    repo = new DrizzleFrentesRepository(db);
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table frentes_escala, turnos, especialidades, modalidades, usuarios, papeis, medicos, tipos_ausencia cascade`,
    );
    const [n, m] = await db
      .insert(schema.especialidades)
      .values([
        { nome: 'NEURO', ordem: 2, cor: '#123456' },
        { nome: 'MUSCULOESQUELETICO', ordem: 1, descricao: 'Osso' },
      ])
      .returning();
    const [c, r] = await db
      .insert(schema.modalidades)
      .values([
        { codigo: 'CT', ordem: 1, ativo: false },
        { codigo: 'RX', ordem: 0 },
      ])
      .returning();
    neuro = n?.id ?? '';
    msk = m?.id ?? '';
    ct = c?.id ?? '';
    rx = r?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  const idDaFrente = async (destino: { especialidadeIds?: string[]; modalidadeIds?: string[] }) =>
    (
      await garantirFrentes(db, {
        especialidadeIds: destino.especialidadeIds ?? [],
        modalidadeIds: destino.modalidadeIds ?? [],
      })
    )[0] ?? '';

  it('lê a frente com nome, cor, ordem, ativo e descrição do catálogo', async () => {
    const id = await idDaFrente({ especialidadeIds: [neuro] });
    const idCt = await idDaFrente({ modalidadeIds: [ct] });

    expect(await repo.buscar(id)).toEqual({
      id,
      tipo: 'especialidade',
      especialidadeId: neuro,
      modalidadeId: null,
      rotulo: 'NEURO',
      destinoNome: 'NEURO',
      descricao: null,
      cor: '#123456',
      ordem: 2,
      ativo: true,
    });
    expect(await repo.buscar(idCt)).toMatchObject({
      tipo: 'modalidade',
      modalidadeId: ct,
      rotulo: 'CT',
      destinoNome: 'CT',
      ativo: false,
    });
  });

  it('não acha frente que não existe', async () => {
    expect(await repo.buscar('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('lista as especialidades e depois as modalidades, cada uma pela ordem do catálogo', async () => {
    await garantirFrentes(db, { especialidadeIds: [neuro, msk], modalidadeIds: [ct, rx] });

    const pagina = await repo.listar({ pagina: 1, porPagina: 3 });

    expect(pagina.total).toBe(4);
    expect(pagina.itens.map((f) => f.rotulo)).toEqual(['MUSCULOESQUELETICO', 'NEURO', 'RX']);
    expect((await repo.listar({ pagina: 2, porPagina: 3 })).itens.map((f) => f.rotulo)).toEqual([
      'CT',
    ]);
  });

  it('busca no nome e na descrição do catálogo e filtra pelo ativo do catálogo', async () => {
    await garantirFrentes(db, { especialidadeIds: [neuro, msk], modalidadeIds: [ct, rx] });

    const nomes = async (filtro: { busca?: string; ativo?: boolean }) =>
      (await repo.listar({ ...filtro, pagina: 1, porPagina: 10 })).itens.map((f) => f.rotulo);

    expect(await nomes({ busca: 'osso' })).toEqual(['MUSCULOESQUELETICO']);
    expect(await nomes({ busca: 'rx' })).toEqual(['RX']);
    expect(await nomes({ ativo: false })).toEqual(['CT']);
    expect((await repo.listar({ ativo: true, pagina: 1, porPagina: 10 })).total).toBe(3);
  });
});
