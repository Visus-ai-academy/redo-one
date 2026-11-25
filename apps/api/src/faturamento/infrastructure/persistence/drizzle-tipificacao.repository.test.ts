import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { EventoAuditoria } from '../../../auditoria/auditoria';
import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { ReclassificarTipificacao } from '../../../ingestao/application/use-cases/reclassificar-tipificacao';
import { DrizzleCadastrosIngestao } from '../../../ingestao/infrastructure/persistence/drizzle-cadastros-ingestao';
import { DrizzleLaudosRepository } from '../../../ingestao/infrastructure/persistence/drizzle-laudos.repository';
import { CarregarTipificador } from '../../application/use-cases/carregar-tipificador';
import {
  VersaoTipificacaoAlteradaError,
  VigenciaTipificacaoInvalidaError,
} from '../../domain/versoes-tipificacao';
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
      sql`truncate table regras_tipificacao, subregras_tipificacao, clientes_tipificacao_versoes, eventos_auditoria, laudos, importacoes, competencias, clientes, medicos, equipes, especialidades cascade`,
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
        { nome: 'CO', padrao: true, ordem: 0 },
        { nome: 'NC', ordem: 1 },
      ])
      .returning();
    ids.co = co?.id ?? '';
    ids.nc = nc?.id ?? '';
    const [ncnf, ncft] = await db
      .insert(schema.subregrasTipificacao)
      .values([
        { regraId: ids.nc, nome: 'NC-NF' },
        { regraId: ids.nc, nome: 'NC-FT', ordem: 1 },
      ])
      .returning();
    ids.ncnf = ncnf?.id ?? '';
    ids.ncft = ncft?.id ?? '';
    await db.insert(schema.regrasTipificacaoFatura).values([
      { regraId: ids.co, vigenciaDesde: '2024-01', faturaSemSubregra: true },
      { regraId: ids.nc, vigenciaDesde: '2024-01', faturaSemSubregra: false },
    ]);
    await db.insert(schema.subregrasTipificacaoFatura).values([
      { subregraId: ids.ncnf, vigenciaDesde: '2024-01', fatura: false },
      { subregraId: ids.ncft, vigenciaDesde: '2024-01', fatura: true },
    ]);
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

  const opcoes = (aPartirDe: string, eventos: EventoAuditoria[] = []) => ({
    usuarioId: ids.usuario,
    aPartirDe,
    eventos,
  });
  const criar = <T>(id: string, desde: string, valor: T, ate: string | null = null) => ({
    tipo: 'criar' as const,
    id,
    vigenciaDesde: desde,
    vigenciaAte: ate,
    valor,
  });
  const V1 = '00000000-0000-4000-8000-000000000001';
  const V2 = '00000000-0000-4000-8000-000000000002';
  /** Versão programada: começa depois do mês atual em qualquer data em que o teste rodar. */
  const FUTURA = '2099-01';

  it('grava e lê as versões da configuração; encerra, apaga a programada e reabre, com eventos e reclassificação', async () => {
    await cenario();
    await repo.aplicarConfiguracaoCliente(
      ids.unidade,
      ids.principal,
      [criar(V1, '2024-01', configUnidade())],
      opcoes('2024-01', [
        {
          ator: { tipo: 'usuario', id: ids.usuario },
          entidade: 'cliente_tipificacao_versao',
          entidadeId: V1,
          acao: 'criada',
          depois: { clienteId: ids.unidade },
          em: agora,
        },
      ]),
    );
    expect(await repo.listarVersoesCliente(ids.unidade)).toEqual([
      { id: V1, vigenciaDesde: '2024-01', vigenciaAte: null, valor: configUnidade() },
    ]);
    expect(await jobs()).toEqual([{ clienteIds: [ids.principal] }]);
    expect(await repo.eventos('cliente_tipificacao_versao', [V1])).toEqual(
      new Map([[V1, [{ acao: 'criada', quem: 'Carla', em: agora }]]]),
    );

    const vazia = { regraId: null, subregraDemaisId: null, linhas: [] };
    await repo.aplicarConfiguracaoCliente(
      ids.unidade,
      ids.principal,
      [
        { tipo: 'encerrar', id: V1, vigenciaAteAntes: null, vigenciaAte: '2098-12' },
        criar(V2, FUTURA, vazia),
      ],
      opcoes(FUTURA),
    );
    expect(await repo.listarVersoesCliente(ids.unidade)).toEqual([
      { id: V1, vigenciaDesde: '2024-01', vigenciaAte: '2098-12', valor: configUnidade() },
      { id: V2, vigenciaDesde: FUTURA, vigenciaAte: null, valor: vazia },
    ]);
    const tipificacao = await repo.carregarConfiguracao();
    expect(tipificacao?.clientes.map((c) => [c.vigenciaDesde, c.linhas.length])).toEqual([
      ['2024-01', 1],
      [FUTURA, 0],
    ]);

    // Edição simultânea: o `vigencia_ate` de antes não confere; nada é gravado.
    await expect(
      repo.aplicarConfiguracaoCliente(
        ids.unidade,
        ids.principal,
        [{ tipo: 'encerrar', id: V1, vigenciaAteAntes: null, vigenciaAte: '2026-12' }],
        opcoes('2027-01'),
      ),
    ).rejects.toBeInstanceOf(VersaoTipificacaoAlteradaError);
    // Versão que cruza outra: recusada.
    await expect(
      repo.aplicarConfiguracaoCliente(
        ids.unidade,
        ids.principal,
        [criar('00000000-0000-4000-8000-000000000003', '2099-05', vazia)],
        opcoes('2099-05'),
      ),
    ).rejects.toBeInstanceOf(VersaoTipificacaoAlteradaError);
    // A que já valeu não se apaga.
    await expect(
      repo.aplicarConfiguracaoCliente(
        ids.unidade,
        ids.principal,
        [{ tipo: 'remover', id: V1 }],
        opcoes(FUTURA),
      ),
    ).rejects.toBeInstanceOf(VersaoTipificacaoAlteradaError);

    await repo.aplicarConfiguracaoCliente(
      ids.unidade,
      ids.principal,
      [
        { tipo: 'remover', id: V2 },
        { tipo: 'reabrir', id: V1, vigenciaAteAntes: '2098-12', vigenciaAte: null },
      ],
      opcoes(FUTURA),
    );
    expect(await repo.listarVersoesCliente(ids.unidade)).toEqual([
      { id: V1, vigenciaDesde: '2024-01', vigenciaAte: null, valor: configUnidade() },
    ]);
  });

  it('não muda a partir de uma competência que acabou de ser fechada ou travada', async () => {
    await cenario();
    await db.insert(schema.competencias).values({ competencia: '2099-02', status: 'fechada' });
    await expect(
      repo.aplicarConfiguracaoCliente(
        ids.unidade,
        ids.principal,
        [criar(V1, FUTURA, configUnidade())],
        opcoes(FUTURA),
      ),
    ).rejects.toBeInstanceOf(VigenciaTipificacaoInvalidaError);
    expect(await repo.listarVersoesCliente(ids.unidade)).toEqual([]);
  });

  it('lista regras e sub-regras com o "fatura" por versão e quantos clientes usam; mudar o "fatura" reclassifica todos', async () => {
    await cenario();
    await repo.aplicarConfiguracaoCliente(
      ids.unidade,
      ids.principal,
      [criar(V1, '2024-01', configUnidade())],
      opcoes('2024-01'),
    );
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
      { regraId: ids.nc, nome: 'NC-X', descricao: null, ativo: true },
      { id: V2, vigenciaDesde: '2026-11', valor: true, usuarioId: ids.usuario },
      false,
    );
    await repo.salvarRegra(
      ids.nc,
      { nome: 'NC', descricao: 'Não consolidada', cor: '#ff0000', ativo: true },
      null,
    );
    const subNova = (await repo.listarSubregras()).find((s) => s.id === nova);
    expect(subNova?.ordem).toBe(2);
    expect(subNova?.fatura).toEqual([
      { id: V2, vigenciaDesde: '2026-11', vigenciaAte: null, valor: true },
    ]);
    // Nome, descrição e cor não mudam o cálculo.
    expect(await jobs()).toEqual([]);

    const [atual] = (await repo.listarRegras()).filter((r) => r.id === ids.nc).map((r) => r.fatura);
    await repo.aplicarFatura(
      { tipo: 'regra', id: ids.nc },
      [
        {
          tipo: 'encerrar',
          id: atual?.[0]?.id as string,
          vigenciaAteAntes: null,
          vigenciaAte: '2098-12',
        },
        criar(V1, FUTURA, true),
      ],
      opcoes(FUTURA),
    );
    expect(
      (await repo.listarRegras())
        .find((r) => r.id === ids.nc)
        ?.fatura.map((f) => [f.vigenciaDesde, f.vigenciaAte, f.valor]),
    ).toEqual([
      ['2024-01', '2098-12', false],
      [FUTURA, null, true],
    ]);
    expect(await jobs()).toEqual([{ clienteIds: null }]);
    const config = await repo.carregarConfiguracao();
    expect(config?.regras.find((r) => r.id === ids.nc)?.faturaSemSubregra).toHaveLength(2);
  });

  it('reclassifica os laudos abertos pela versão vigente na competência, com a unidade de origem pela empresa', async () => {
    await cenario();
    // Até 11/2026 a configuração da unidade; a partir de 12/2026, nenhuma (a do principal).
    await repo.aplicarConfiguracaoCliente(
      ids.unidade,
      ids.principal,
      [
        criar(V1, '2024-01', configUnidade(), '2026-11'),
        criar(V2, '2026-12', { regraId: null, subregraDemaisId: null, linhas: [] }),
      ],
      opcoes('2024-01'),
    );
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
        laudo('rj-dezembro', 'CEDI_RJ', ids.ana, '2026-12'),
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
      lidos: 4,
      alterados: 4,
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
      { identidade: 'rj-dezembro', unidade: true, sub: null, fatura: true },
      { identidade: 'rj-sem', unidade: true, sub: 'NC-FT', fatura: true },
    ]);
    expect(await reclassificar.executar({ clienteIds: null })).toEqual({ lidos: 4, alterados: 0 });

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
      [2, true],
    ]);
  });
});
