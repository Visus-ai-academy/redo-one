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
import {
  AlterarRegraApuracao,
  CancelarRegraApuracao,
  CancelarVersaoContagem,
  CriarRegraApuracao,
  ListarContagemMedico,
  NovaVersaoContagem,
} from '../../application/use-cases/regras-medico';
import { DrizzleRegrasMedicoRepository } from './drizzle-regras-medico.repository';

const url = process.env.TEST_DATABASE_URL;
const primeiro = async (p: Promise<{ id: string }[]>) => ((await p)[0] as { id: string }).id;
const agora = () => new Date('2026-11-26T12:00:00Z');

describe.skipIf(!url)('DrizzleRegrasMedicoRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleRegrasMedicoRepository;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 2 });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    await runMigrations({ pgPool: pool });
    repo = new DrizzleRegrasMedicoRepository(db);
  });

  beforeEach(async () => {
    await db.execute(sql`delete from graphile_worker._private_jobs`);
    await db.execute(
      sql`truncate table configuracoes_medico_repasse, regras_apuracao_repasse, medicos, clientes, especialidades, eventos_auditoria, competencias, usuarios cascade`,
    );
    ids.medico = await primeiro(
      db.insert(schema.medicos).values({ nome: 'Ana', chaveNormalizada: 'ana' }).returning(),
    );
    ids.neuro = await primeiro(
      db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning(),
    );
    ids.cli = await primeiro(
      db.insert(schema.clientes).values({ nome: 'HOSP', chaveNormalizada: 'hosp' }).returning(),
    );
    ids.u = await primeiro(
      db
        .insert(schema.usuarios)
        .values({ nome: 'Bruno', email: `b-${randomUUID()}@x.com` } as never)
        .returning(),
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('contagem: versão nova, recortes com nomes e cancelamento da programada', async () => {
    const m = ids.medico as string;
    const u = ids.u as string;
    await new NovaVersaoContagem(repo, agora).executar(
      u,
      m,
      { modo: 'somente_adicionais', recortes: [] },
      '2026-11',
    );
    const p = await new NovaVersaoContagem(repo, agora).executar(
      u,
      m,
      {
        modo: 'recortes',
        recortes: [{ clienteId: ids.cli as string, especialidadeId: null }],
      },
      '2026-12',
    );
    const lida = await new ListarContagemMedico(repo, agora).executar(m);
    expect(
      lida.versoes.map((v) => [v.modo, v.vigenciaDesde, v.vigenciaAte, v.encerradoPor]),
    ).toEqual([
      ['recortes', '2026-12', null, null],
      ['somente_adicionais', '2026-11', '2026-11', 'Bruno'],
    ]);
    expect(lida.versoes[0]?.recortes).toEqual([
      { clienteId: ids.cli, cliente: 'HOSP', especialidadeId: null, especialidade: null },
    ]);

    await new CancelarVersaoContagem(repo, agora).executar(u, m, p);
    const depois = await new ListarContagemMedico(repo, agora).executar(m);
    expect(depois.versoes.map((v) => [v.modo, v.vigenciaAte, v.reabertoPor])).toEqual([
      ['somente_adicionais', null, 'Bruno'],
    ]);
  });

  it('regra de apuração: cria, altera e cancela a programada com os recortes', async () => {
    const m = ids.medico as string;
    const u = ids.u as string;
    const dados = {
      tipo: 'percentual_repasse' as const,
      descricao: 'Coordenação',
      valorCentavos: null,
      percentualPpm: 60000,
      divisor: 2,
      modalidadeIds: null,
      especialidadeIds: [ids.neuro as string],
      prioridadeIds: null,
    };
    const r1 = await new CriarRegraApuracao(repo, agora).executar(u, m, dados, '2026-11');
    const r2 = await new AlterarRegraApuracao(repo, agora).executar(
      u,
      m,
      r1,
      { ...dados, percentualPpm: 70000 },
      '2026-12',
    );
    let regras = await repo.listarRegras(m);
    expect(regras.find((r) => r.id === r2)).toMatchObject({
      percentualPpm: 70000,
      especialidadeIds: [ids.neuro],
      modalidadeIds: null,
      nomes: { especialidades: ['NEURO'] },
      criadoPor: 'Bruno',
    });
    await new CancelarRegraApuracao(repo, agora).executar(u, m, r2);
    regras = await repo.listarRegras(m);
    expect(regras.map((r) => [r.id, r.vigenciaAte])).toEqual([[r1, null]]);
  });
});
