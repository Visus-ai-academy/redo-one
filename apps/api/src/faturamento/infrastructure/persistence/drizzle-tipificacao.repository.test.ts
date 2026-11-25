import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { ReclassificarTipificacao } from '../../../ingestao/application/use-cases/reclassificar-tipificacao';
import { DrizzleCadastrosIngestao } from '../../../ingestao/infrastructure/persistence/drizzle-cadastros-ingestao';
import { DrizzleLaudosRepository } from '../../../ingestao/infrastructure/persistence/drizzle-laudos.repository';
import { CarregarTipificador } from '../../application/use-cases/carregar-tipificador';
import { DrizzleCompetenciasRepository } from './drizzle-competencias.repository';
import { DrizzleEquipesMedicos } from './drizzle-equipes-medicos';
import { DrizzleTipificacaoRepository } from './drizzle-tipificacao.repository';

const url = process.env.TEST_DATABASE_URL;
const agora = new Date('2026-11-24T12:00:00Z');

describe.skipIf(!url)('DrizzleTipificacaoRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleTipificacaoRepository;
  const ids = {} as Record<
    | 'co'
    | 'nc'
    | 'ncnf'
    | 'ncft'
    | 'principal'
    | 'unidade'
    | 'mi'
    | 'ana'
    | 'bia'
    | 'equipe'
    | 'usuario',
    string
  >;

  const jobs = async () =>
    (
      await db.execute<{ payload: unknown }>(
        sql`select j.payload from graphile_worker._private_jobs j order by j.id`,
      )
    ).rows.map((r) => r.payload);

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    await runMigrations({ pgPool: pool });
    repo = new DrizzleTipificacaoRepository(db);
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table regras_tipificacao, subregras_tipificacao, clientes_tipificacao, laudos, importacoes, competencias, clientes, medicos, equipes, especialidades cascade`,
    );
    await db.execute(sql`delete from graphile_worker._private_jobs`);
  });

  afterAll(async () => {
    await pool.end();
  });

  /** CO (padrão) e NC com NC-NF e NC-FT; CEDIDIAG com a unidade CEDI_RJ; Ana na equipe. */
  const cenario = async () => {
    const [co, nc] = await db
      .insert(schema.regrasTipificacao)
      .values([
        { nome: 'CO', faturaSemSubregra: true, padrao: true, ordem: 0 },
        { nome: 'NC', faturaSemSubregra: false, ordem: 1 },
      ])
      .returning();
    ids.co = co?.id ?? '';
    ids.nc = nc?.id ?? '';
    const [ncnf, ncft] = await db
      .insert(schema.subregrasTipificacao)
      .values([
        { regraId: ids.nc, nome: 'NC-NF', fatura: false },
        { regraId: ids.nc, nome: 'NC-FT', fatura: true, ordem: 1 },
      ])
      .returning();
    ids.ncnf = ncnf?.id ?? '';
    ids.ncft = ncft?.id ?? '';
    const [p] = await db
      .insert(schema.clientes)
      .values({ nome: 'CEDIDIAG', chaveNormalizada: 'cedidiag' })
      .returning();
    ids.principal = p?.id ?? '';
    const [u] = await db
      .insert(schema.clientes)
      .values({ nome: 'CEDI_RJ', chaveNormalizada: 'cedi rj', unificadoEmId: ids.principal })
      .returning();
    ids.unidade = u?.id ?? '';
    const [mi] = await db
      .insert(schema.especialidades)
      .values({ nome: 'MEDICINA INTERNA' })
      .returning();
    ids.mi = mi?.id ?? '';
    const [ana, bia] = await db
      .insert(schema.medicos)
      .values([
        { nome: 'Ana', chaveNormalizada: 'ana' },
        { nome: 'Bia', chaveNormalizada: 'bia' },
      ])
      .returning();
    ids.ana = ana?.id ?? '';
    ids.bia = bia?.id ?? '';
    const [equipe] = await db.insert(schema.equipes).values({ nome: 'Equipe 2' }).returning();
    ids.equipe = equipe?.id ?? '';
    const [usuario] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Carla', email: `tipificacao-${Math.random()}@exemplo.com` })
      .returning();
    ids.usuario = usuario?.id ?? '';
    await db.insert(schema.equipesMembros).values({ equipeId: ids.equipe, medicoId: ids.ana });
  };

  const configUnidade = () => ({
    regraId: ids.nc,
    subregraDemaisId: ids.ncft,
    linhas: [
      {
        tipo: 'especialidade' as const,
        valores: [ids.mi],
        modoMedico: 'apenas' as const,
        medicos: [ids.bia],
        equipes: [ids.equipe],
        subregraId: ids.ncnf,
      },
    ],
  });

  it('sem regra cadastrada, não há configuração', async () => {
    expect(await repo.carregarConfiguracao()).toBeNull();
  });

  it('grava e lê a configuração do cliente; trocar apaga as linhas antigas e enfileira a reclassificação do principal', async () => {
    await cenario();
    await repo.salvarConfiguracaoCliente(ids.unidade, configUnidade(), ids.principal, {
      usuarioId: ids.usuario,
      em: agora,
    });

    expect(await repo.obterConfiguracaoCliente(ids.unidade)).toEqual({
      clienteId: ids.unidade,
      ...configUnidade(),
      atualizadoEm: agora,
      atualizadoPor: 'Carla',
    });
    expect(await jobs()).toEqual([{ clienteIds: [ids.principal] }]);

    await repo.salvarConfiguracaoCliente(
      ids.unidade,
      { regraId: null, subregraDemaisId: null, linhas: [] },
      ids.principal,
      { usuarioId: ids.usuario, em: agora },
    );
    expect((await repo.obterConfiguracaoCliente(ids.unidade))?.linhas).toEqual([]);
    const linhas = await db.select().from(schema.clientesTipificacaoLinhas);
    expect(linhas).toEqual([]);

    await repo.salvarConfiguracaoCliente(ids.unidade, null, ids.principal, {
      usuarioId: ids.usuario,
      em: agora,
    });
    expect(await repo.obterConfiguracaoCliente(ids.unidade)).toBeNull();
  });

  it('lista regras e sub-regras com quantos clientes usam; salvar enfileira a reclassificação de todos', async () => {
    await cenario();
    await repo.salvarConfiguracaoCliente(ids.unidade, configUnidade(), ids.principal, {
      usuarioId: ids.usuario,
      em: agora,
    });
    expect((await repo.listarRegras()).map((r) => [r.nome, r.padrao, r.clientes])).toEqual([
      ['CO', true, 0],
      ['NC', false, 1],
    ]);
    expect((await repo.listarSubregras()).map((s) => [s.nome, s.clientes])).toEqual([
      ['NC-NF', 1],
      ['NC-FT', 1],
    ]);
    expect(await repo.subregraComNome('nc-nf')).toBe(ids.ncnf);

    await db.execute(sql`delete from graphile_worker._private_jobs`);
    const nova = await repo.salvarSubregra(
      null,
      {
        regraId: ids.nc,
        nome: 'NC-X',
        descricao: null,
        fatura: true,
        ativo: true,
      },
      false,
    );
    await repo.salvarRegra(
      ids.nc,
      {
        nome: 'NC',
        descricao: 'Não consolidada',
        cor: '#ff0000',
        faturaSemSubregra: false,
        ativo: true,
      },
      true,
    );
    expect((await repo.listarSubregras()).find((s) => s.id === nova)?.ordem).toBe(2);
    expect(await jobs()).toEqual([{ clienteIds: null }]);
  });

  it('reclassifica os laudos abertos pela configuração gravada, com a unidade de origem pela empresa', async () => {
    await cenario();
    await repo.salvarConfiguracaoCliente(ids.unidade, configUnidade(), ids.principal, {
      usuarioId: ids.usuario,
      em: agora,
    });
    const [importacao] = await db
      .insert(schema.importacoes)
      .values({ origem: 'mobilemed' })
      .returning();
    const laudo = (
      identidade: string,
      empresa: string,
      medicoId: string | null,
      competencia: string,
    ) => ({
      identidade,
      hashConteudo: identidade,
      importacaoId: importacao?.id ?? '',
      origem: 'normal' as const,
      empresaOrigem: empresa,
      clienteId: ids.principal,
      pacienteChave: 'p',
      estudo: 'TC',
      modalidadeOrigem: 'CT',
      especialidadeId: ids.mi,
      prioridadeOrigem: 'Rotina',
      medicoId,
      volume: 2,
      status: 'Assinado',
      dataRealizacao: agora,
      dataLaudo: agora,
      diaLaudo: '2026-11-24',
      competencia,
    });
    await db
      .insert(schema.laudos)
      .values([
        laudo('rj-ana', 'CEDI_RJ', ids.ana, '2026-11'),
        laudo('rj-sem', 'CEDI_RJ', null, '2026-11'),
        laudo('principal', 'CEDIDIAG', ids.ana, '2026-11'),
        laudo('fechado', 'CEDI_RJ', ids.ana, '2026-10'),
      ]);
    await db.insert(schema.competencias).values({ competencia: '2026-10', status: 'fechada' });

    const reclassificar = new ReclassificarTipificacao(
      new DrizzleLaudosRepository(db),
      new DrizzleCompetenciasRepository(db),
      new DrizzleCadastrosIngestao(db),
      new CarregarTipificador(repo, new DrizzleEquipesMedicos(db)),
      () => agora,
    );
    expect(await reclassificar.executar({ clienteIds: [ids.principal] })).toEqual({
      lidos: 3,
      alterados: 3,
    });
    const r = await db.execute<{
      identidade: string;
      unidade: boolean;
      sub: string | null;
      fatura: boolean | null;
    }>(sql`
      select l.identidade, l.unidade_id is not null unidade, s.nome sub, c.fatura
      from laudos l left join classificacoes_laudo c on c.laudo_id = l.id
      left join subregras_tipificacao s on s.id = c.subregra_id order by l.identidade`);
    expect(r.rows).toEqual([
      { identidade: 'fechado', unidade: false, sub: null, fatura: null },
      { identidade: 'principal', unidade: false, sub: null, fatura: true },
      { identidade: 'rj-ana', unidade: true, sub: 'NC-NF', fatura: false },
      { identidade: 'rj-sem', unidade: true, sub: 'NC-FT', fatura: true },
    ]);
    expect(await reclassificar.executar({ clienteIds: null })).toEqual({ lidos: 3, alterados: 0 });

    const previa = await repo.lerParaPrevia({
      clienteId: ids.principal,
      unidadeId: ids.unidade,
      competenciasBloqueadas: ['2026-10'],
      depoisDe: null,
      limite: 10,
    });
    expect(previa.map((l) => [l.volume, l.unidadeId === ids.unidade])).toEqual([
      [2, true],
      [2, true],
    ]);
  });
});
