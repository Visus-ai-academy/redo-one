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
import {
  CriarRegraApuracao,
  ListarRegrasApuracaoGeral,
} from '../../application/use-cases/regras-medico';
import {
  AlterarRegua,
  IncluirRegua,
  ListarRegua,
  MedicoSemNivelError,
  PreencherPelaRegua,
} from '../../application/use-cases/regua-nivel';
import { DrizzlePrecosRepasseRepository } from './drizzle-precos-repasse.repository';
import { DrizzleRegrasMedicoRepository } from './drizzle-regras-medico.repository';
import { DrizzleReguaNivelRepository } from './drizzle-regua-nivel.repository';

const url = process.env.TEST_DATABASE_URL;
const um = async (p: Promise<{ id: string }[]>) => ((await p)[0] as { id: string }).id;
const agora = () => new Date('2026-11-26T12:00:00Z');

describe.skipIf(!url)('régua por nível no banco', () => {
  let pool: Pool;
  let db: Database;
  let regua: DrizzleReguaNivelRepository;
  let precos: DrizzlePrecosRepasseRepository;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 2 });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    await runMigrations({ pgPool: pool });
    regua = new DrizzleReguaNivelRepository(db);
    precos = new DrizzlePrecosRepasseRepository(db, new DrizzleRegistroAvisos());
  });

  beforeEach(async () => {
    await db.execute(sql`delete from graphile_worker._private_jobs`);
    await db.execute(
      sql`truncate table reguas_repasse_nivel, precos_repasse, regras_apuracao_repasse, medicos, niveis_medico, exames, modalidades, especialidades, categorias_exame, prioridades, eventos_auditoria, competencias, usuarios cascade`,
    );
    ids.nivel = await um(
      db
        .insert(schema.niveisMedico)
        .values({ nome: 'Nível 1' } as never)
        .returning(),
    );
    ids.medico = await um(
      db
        .insert(schema.medicos)
        .values({ nome: 'Ana Lima', chaveNormalizada: 'ana lima', nivelId: ids.nivel })
        .returning(),
    );
    ids.semNivel = await um(
      db.insert(schema.medicos).values({ nome: 'Bia', chaveNormalizada: 'bia' }).returning(),
    );
    ids.mr = await um(db.insert(schema.modalidades).values({ codigo: 'MR' }).returning());
    ids.neuro = await um(db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning());
    ids.sc = await um(db.insert(schema.categoriasExame).values({ nome: 'SC' }).returning());
    ids.cc = await um(db.insert(schema.categoriasExame).values({ nome: 'CC' }).returning());
    ids.rot = await um(db.insert(schema.prioridades).values({ nome: 'ROTINA' }).returning());
    for (const [nome, categoriaId] of [
      ['RM CRANIO', ids.sc],
      ['RM CRANIO CC', ids.cc],
    ] as const)
      await db.insert(schema.exames).values({
        nome,
        chaveNormalizada: nome.toLowerCase(),
        modalidadeId: ids.mr,
        especialidadeId: ids.neuro,
        categoriaId,
      } as never);
    ids.u = await um(
      db
        .insert(schema.usuarios)
        .values({ nome: 'Bruno', email: `b-${randomUUID()}@x.com` } as never)
        .returning(),
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('régua: inclui com "todas", altera e preenche o médico pela régua do nível', async () => {
    const nivel = ids.nivel as string;
    const u = ids.u as string;
    const linha = await new IncluirRegua(regua, agora).executar(
      u,
      {
        nivelId: nivel,
        modalidadeId: ids.mr as string,
        especialidadeId: ids.neuro as string,
        categoriaId: null,
        prioridadeId: null,
        valorCentavos: 2700,
      },
      '2026-11',
    );
    await new AlterarRegua(regua, agora).executar(u, nivel, linha, 2900, '2026-12');
    const lida = await new ListarRegua(regua, agora).executar(nivel);
    expect(
      lida.linhas.map((l) => [l.valorCentavos, l.vigenciaDesde, l.vigenciaAte, l.nomes.categoria]),
    ).toEqual([
      [2900, '2026-12', null, null],
      [2700, '2026-11', '2026-11', null],
    ]);

    const preencher = new PreencherPelaRegua(regua, precos, agora);
    const previa = await preencher.executar(u, ids.medico as string, '2026-12', false);
    expect(previa.itens.map((i) => [i.nomes.categoria, i.acao, i.novoCentavos])).toEqual([
      ['CC', 'incluir', 2900],
      ['SC', 'incluir', 2900],
    ]);
    expect(await precos.listarVersoes(ids.medico as string)).toEqual([]);
    await preencher.executar(u, ids.medico as string, '2026-12', true);
    expect((await precos.listarVersoes(ids.medico as string)).map((p) => p.valorCentavos)).toEqual([
      2900, 2900,
    ]);
    const outra = await preencher.executar(u, ids.medico as string, '2026-12', false);
    expect(outra.itens.map((i) => i.acao)).toEqual(['igual', 'igual']);

    await expect(preencher.executar(u, ids.semNivel as string, '2026-12', false)).rejects.toThrow(
      MedicoSemNivelError,
    );
  });

  it('lista geral das regras de apuração com busca sem acento e filtro de tipo', async () => {
    const repo = new DrizzleRegrasMedicoRepository(db);
    await new CriarRegraApuracao(repo, agora).executar(
      ids.u as string,
      ids.medico as string,
      {
        tipo: 'fixo',
        descricao: 'Coordenação',
        valorCentavos: 100000,
        percentualPpm: null,
        divisor: 1,
        modalidadeIds: null,
        especialidadeIds: null,
        prioridadeIds: null,
      },
      '2026-11',
    );
    const geral = new ListarRegrasApuracaoGeral(repo, agora);
    const r = await geral.executar({ busca: 'ÁNA', pagina: 1, porPagina: 10 });
    expect(r.itens.map((x) => [x.medico, x.descricao])).toEqual([['Ana Lima', 'Coordenação']]);
    expect((await geral.executar({ tipo: 'por_laudo', pagina: 1, porPagina: 10 })).total).toBe(0);
  });
});
