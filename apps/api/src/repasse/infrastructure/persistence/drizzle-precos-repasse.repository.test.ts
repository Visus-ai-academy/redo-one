import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleRegistroAvisos } from '../../../ingestao/infrastructure/persistence/drizzle-registro-avisos';
import { MudarPrecosMedico } from '../../application/use-cases/precos-medico';
import { VersaoPrecoConflitanteError } from '../../domain/versoes-preco';
import { DrizzlePrecosRepasseRepository } from './drizzle-precos-repasse.repository';

const url = process.env.TEST_DATABASE_URL;
const primeiro = async (p: Promise<{ id: string }[]>) => ((await p)[0] as { id: string }).id;

describe.skipIf(!url)('DrizzlePrecosRepasseRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzlePrecosRepasseRepository;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 2 });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    await runMigrations({ pgPool: pool });
    repo = new DrizzlePrecosRepasseRepository(db, new DrizzleRegistroAvisos());
  });

  beforeEach(async () => {
    await db.execute(sql`delete from graphile_worker._private_jobs`);
    await db.execute(
      sql`truncate table precos_repasse, medicos, clientes, modalidades, especialidades, categorias_exame, prioridades, eventos_auditoria, avisos_cadastro, competencias, usuarios cascade`,
    );
    ids.medico = await primeiro(
      db
        .insert(schema.medicos)
        .values({ nome: 'Ana Lima', chaveNormalizada: 'ana lima' })
        .returning(),
    );
    ids.tc = await primeiro(db.insert(schema.modalidades).values({ codigo: 'TC' }).returning());
    ids.neuro = await primeiro(
      db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning(),
    );
    ids.sc = await primeiro(db.insert(schema.categoriasExame).values({ nome: 'SC' }).returning());
    ids.rot = await primeiro(db.insert(schema.prioridades).values({ nome: 'ROTINA' }).returning());
    ids.cli = await primeiro(
      db
        .insert(schema.clientes)
        .values({ nome: 'HOSPITAL X', chaveNormalizada: 'hospital x' })
        .returning(),
    );
    ids.usuario = await primeiro(
      db
        .insert(schema.usuarios)
        .values({ nome: 'Bruno Reis', email: `bruno-${randomUUID()}@x.com` } as never)
        .returning(),
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  const arranjo = () => ({
    modalidadeId: ids.tc as string,
    especialidadeId: ids.neuro as string,
    categoriaId: ids.sc as string,
    prioridadeId: ids.rot as string,
  });

  it('inclui, altera e encerra com nomes, auditoria e prévias pedidas', async () => {
    const casos = new MudarPrecosMedico(repo, () => new Date('2026-11-26T12:00:00Z'));
    const medico = ids.medico as string;
    const a = await casos.incluir(
      ids.usuario as string,
      medico,
      { ...arranjo(), clienteId: null, valorCentavos: 3207 },
      '2026-11',
    );
    await casos.incluir(
      ids.usuario as string,
      medico,
      { ...arranjo(), clienteId: ids.cli as string, valorCentavos: 4500 },
      '2026-11',
    );
    const b = await casos.alterar(
      ids.usuario as string,
      medico,
      a,
      { ...arranjo(), clienteId: null, valorCentavos: 4800 },
      '2026-12',
    );

    const versoes = await repo.listarVersoes(medico, arranjo());
    const porId = Object.fromEntries(versoes.map((v) => [v.id, v]));
    expect(porId[a]?.vigenciaAte).toBe('2026-11');
    expect(porId[b]).toMatchObject({ valorCentavos: 4800, vigenciaDesde: '2026-12' });
    expect(versoes.find((v) => v.clienteId)?.nomes.cliente).toBe('HOSPITAL X');
    expect((await repo.eventos([a])).get(a)?.map((e) => [e.acao, e.quem])).toEqual([
      ['criado', 'Bruno Reis'],
      ['encerrado', 'Bruno Reis'],
    ]);
    const jobs = await db.execute(
      sql`select count(*)::int as n from graphile_worker._private_jobs`,
    );
    expect((jobs.rows[0] as { n: number }).n).toBeGreaterThan(0);

    // Encerrar a programada a apaga e devolve a anterior.
    await casos.encerrar(ids.usuario as string, medico, b, '2026-12');
    const depois = await repo.listarVersoes(medico, arranjo());
    expect(depois.find((v) => v.id === b)).toBeUndefined();
    expect(depois.find((v) => v.id === a)?.vigenciaAte).toBeNull();
  });

  it('recusa no banco a versão que cruza outra do mesmo arranjo e cliente', async () => {
    await db.insert(schema.precosRepasse).values({
      medicoId: ids.medico as string,
      ...arranjo(),
      todosClientes: true,
      valorCentavos: 100,
      vigenciaDesde: '2026-11',
    });
    await expect(
      repo.aplicar(
        ids.medico as string,
        [
          {
            tipo: 'criar',
            id: randomUUID(),
            dados: { ...arranjo(), clienteId: null, valorCentavos: 200 },
            vigenciaDesde: '2026-12',
            vigenciaAte: null,
          },
        ],
        { usuarioId: ids.usuario as string, aPartirDe: '2026-12', eventos: [] },
      ),
    ).rejects.toThrow(VersaoPrecoConflitanteError);
  });
});
