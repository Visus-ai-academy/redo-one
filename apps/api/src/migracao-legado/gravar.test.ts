import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../database/database';
import * as schema from '../database/schema';
import { CONFIGURACAO_INICIAL } from '../distribuicao/domain/configuracao-global';
import { REGRAS_NEUTRAS } from '../distribuicao/domain/motor/configuracao';
import { DrizzleConfiguracaoDistribuicaoRepository } from '../distribuicao/infrastructure/persistence/drizzle-configuracao-distribuicao.repository';
import { DrizzlePrioridadesClienteRepository } from '../distribuicao/infrastructure/persistence/drizzle-prioridades-cliente.repository';
import { DrizzlePrioridadesOperacaoRepository } from '../distribuicao/infrastructure/persistence/drizzle-prioridades-operacao.repository';
import { DrizzleRegrasFrenteRepository } from '../distribuicao/infrastructure/persistence/drizzle-regras-frente.repository';
import { idDoLegado } from './comum';
import { alocacoesSumidasDoLegado, ausenciasSumidasDoLegado, gravarMigracao } from './gravar';
import type { LegadoCatalogo } from './legado';
import { mapearCatalogo } from './mapear-catalogo';
import { mapearCompetencias } from './mapear-competencias';
import type { ConfiguracaoDistribuicaoMigrada } from './mapear-configuracao-distribuicao';
import { mapearDadosFiscais } from './mapear-dados-fiscais';
import { mapearDistribuicao } from './mapear-distribuicao';
import { type EscalaMigrada, mapearEscala } from './mapear-escala';
import { mapearMedicos } from './mapear-medicos';
import { mapearPrecos } from './mapear-precos';
import { cadastroDaCarga, mapearTipificacao } from './mapear-tipificacao';

const url = process.env.TEST_DATABASE_URL;

const lista = { descricao: null, cor: null, ordem: 0, ativo: true };
const cliente = (id: string, nome: string) => ({
  id,
  nome,
  nomeFantasia: 'PRN',
  razaoSocial: 'PRN LTDA',
  cnpj: '11222333000181',
  cpf: null,
  tipoPessoa: 'PJ',
  contratadoId: 'ct-tele',
  ativo: true,
  observacoes: null,
});

const legadoCatalogo: LegadoCatalogo = {
  modalidades: [{ id: 'mo-ct', nome: 'CT', ...lista }],
  especialidades: [{ id: 'es-neuro', nome: 'NEURO', ...lista }],
  subespecialidades: [],
  subespecialidadesEspecialidades: [],
  categorias: [],
  prioridades: [],
  prioridadesUrgentes: [],
  prioridadesDePara: [],
  especialidadeRegras: [],
  exames: [
    {
      id: 'ex-1',
      nome: 'TC DE CRÂNIO',
      codigoExame: null,
      descricao: null,
      modalidade: 'CT',
      especialidade: 'NEURO',
      subespecialidade: null,
      categoria: null,
      prioridade: null,
      permiteQuebra: false,
      exigeRevisaoManual: false,
      ativo: true,
    },
  ],
  regrasQuebra: [],
  examesForaPadrao: [],
  contratados: [
    {
      id: 'ct-tele',
      razaoSocial: 'TELEIMAGEM',
      cnpj: null,
      endereco: null,
      cidade: null,
      uf: null,
      cep: null,
      contratadoRepasseId: 'ct-tele',
      ativo: true,
    },
  ],
  clientes: [cliente('cl-a', 'PRN TELE_ARARAQUARA'), cliente('cl-b', 'PRN TELE_MARABA')],
  clientesOcultos: [],
  clienteNomeAliases: [],
  clienteApelidos: [
    {
      id: 'ap-1',
      padrao: 'PRN TELE_',
      tipo: 'PREFIXO',
      destino: 'PRN',
      ativo: true,
      observacoes: null,
    },
  ],
};
const catalogo = mapearCatalogo(legadoCatalogo);
const medicos = mapearMedicos({
  medicos: [
    {
      id: 'm1',
      nome: 'Dra. Ana',
      crm: null,
      idMobilemed: 7,
      email: null,
      telefone: null,
      ativo: true,
      senior: false,
      fellowship: false,
      funcao: 'STAFF',
      nivel: null,
      dataInicioVinculo: '2024-03-01',
      observacoes: null,
      cpf: null,
      cnpj: null,
      nomeEmpresa: null,
      tipoChavePix: null,
      chavePix: null,
      socio: 'SIM',
      optanteSimples: null,
      omieCodigoFornecedor: null,
    },
  ],
  aliases: [],
  equipes: [{ id: 'e1', nome: 'Equipe 1', ...lista, plantao: false }],
  equipesMembros: [{ equipeId: 'e1', medicoId: 'm1' }],
});

const escala = mapearEscala(
  {
    turnos: [
      {
        id: 't1',
        nome: 'Manhã',
        tipo: 'fixo',
        horarioInicio: '07:00',
        horarioFim: '13:00',
        cor: null,
        ordem: 0,
        ativo: true,
      },
    ],
    turnosEspecialidades: [{ turnoId: 't1', especialidadeId: 'es-neuro', ativo: true }],
    alocacoes: ['a1', 'c1'].map((id) => ({
      id,
      turnoId: 't1',
      especialidadeId: 'es-neuro',
      medicoId: 'm1',
      diasSemana: [1],
      semanasDoMes: [],
      horarioInicio: '07:00',
      horarioFim: '13:00',
      dataInicio: '2026-01-01',
      dataFim: id === 'c1' ? '2026-01-31' : null,
      status: 'ativo',
      produtividade: 10,
      prioridades: [],
      subespecialidades: [],
      gratificado: false,
      observacoes: null,
      coberturaDeId: id === 'c1' ? 'a1' : null,
      criadoEm: '2026-01-01T00:00:00.000Z',
    })),
    ajustes: [
      { id: 'aj', alocacaoId: 'a1', data: '2026-01-05', produtividade: 3, observacoes: null },
    ],
    ausencias: [
      {
        id: 'au1',
        medicoId: 'm1',
        tipo: 'ferias',
        dataInicio: '2026-07-01',
        dataFim: '2026-07-10',
        observacoes: null,
        especialidadeIds: ['es-neuro'],
        diasSemana: [],
        turnoIds: ['t1'],
        situacao: 'aprovada',
        origem: 'gestor',
        solicitadaPorUserId: null,
        revisadaPorUserId: null,
        revisadaEm: null,
        motivoRecusa: null,
        criadoEm: '2026-06-01T00:00:00.000Z',
      },
    ],
    logs: [
      {
        id: 'l1',
        entidade: 'alocacao_medico',
        registroId: 'a1',
        acao: 'criar',
        usuarioId: null,
        usuarioNome: 'Fulana',
        medicoId: 'm1',
        antes: null,
        depois: { turno: 'Manhã' },
        criadoEm: '2026-01-01T00:00:00.000Z',
      },
    ],
    usuarios: [],
  },
  {
    legadoCatalogo,
    catalogo: catalogo.tabelas,
    medicos: medicos.tabelas,
    prioridadesOperacao: [],
    usuarios: [],
    hoje: '2026-11-16',
  },
);

describe.skipIf(!url)('gravarMigracao', () => {
  let pool: Pool;
  let db: Database;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
    await runMigrations({ pgPool: pool });
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table configuracao_distribuicao, regras_frente, prioridades_cliente, prioridades_operacao, arranjos, medicos_distribuicao, clientes, contratados, exames, modalidades, especialidades, medicos, equipes, turnos, frentes_escala, tipos_ausencia, eventos_auditoria, competencias, regras_tipificacao, subregras_tipificacao, precos_cliente, precos_padrao_contratado, categorias_exame, prioridades cascade`,
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  const contar = async () => {
    const r = await db.execute<{ t: string; n: number }>(sql`
      select 'clientes' t, count(*)::int n from clientes union all
      select 'aliases', count(*)::int from clientes_aliases union all
      select 'exames', count(*)::int from exames union all
      select 'medicos', count(*)::int from medicos union all
      select 'pagamento', count(*)::int from medicos_dados_pagamento union all
      select 'membros', count(*)::int from equipes_membros`);
    return Object.fromEntries(r.rows.map((l) => [l.t, l.n]));
  };

  it('grava tudo com as ligações, e rodar de novo não duplica nada', async () => {
    await gravarMigracao(db, catalogo, medicos);
    const primeira = await contar();
    await gravarMigracao(db, catalogo, medicos);

    expect(await contar()).toEqual(primeira);
    expect(primeira).toEqual({
      clientes: 3,
      aliases: 1,
      exames: 1,
      medicos: 1,
      pagamento: 1,
      membros: 1,
    });
    const unidades = await db.execute<{ nome: string; principal: string }>(sql`
      select u.nome, p.nome principal from clientes u join clientes p on p.id = u.unificado_em_id
      order by u.nome`);
    expect(unidades.rows).toEqual([
      { nome: 'PRN TELE_ARARAQUARA', principal: 'PRN' },
      { nome: 'PRN TELE_MARABA', principal: 'PRN' },
    ]);
  });

  it('grava as competências; rodar de novo dá o mesmo e atualiza o que mudou', async () => {
    const [usuario] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Financeiro', email: 'financeiro2@teleimagem.com.br' } as never)
      .onConflictDoUpdate({ target: schema.usuarios.email, set: { nome: 'Financeiro' } })
      .returning({ id: schema.usuarios.id });
    const usuarioId = usuario?.id as string;
    const legadoComp = (status: string) => [
      {
        competencia: '2026-10',
        status,
        dataFechamento: '2026-11-10T23:34:33.000Z',
        fechadoPor: 'financeiro2@teleimagem.com.br',
        observacoes: null,
        reabertoEm: null,
        reabertoPor: null,
        importacaoTravadaEm: null,
        importacaoTravadaPor: null,
      },
      {
        competencia: '2026-09',
        status: 'fechado',
        dataFechamento: '2026-10-05T12:00:00.000Z',
        fechadoPor: 'claude-code',
        observacoes: null,
        reabertoEm: null,
        reabertoPor: null,
        importacaoTravadaEm: null,
        importacaoTravadaPor: null,
      },
    ];
    const migrar = (status: string) =>
      gravarMigracao(
        db,
        catalogo,
        medicos,
        undefined,
        undefined,
        undefined,
        mapearCompetencias(legadoComp(status), {
          usuarios: [{ id: usuarioId, email: 'financeiro2@teleimagem.com.br' }],
        }),
      );
    const ler = () =>
      db.execute(
        sql`select competencia, status, fechada_por_id, fechada_por_legado from competencias order by competencia`,
      );

    await migrar('fechado');
    const primeira = (await ler()).rows;
    await migrar('fechado');
    expect((await ler()).rows).toEqual(primeira);
    expect(primeira).toEqual([
      {
        competencia: '2026-09',
        status: 'fechada',
        fechada_por_id: null,
        fechada_por_legado: 'claude-code',
      },
      {
        competencia: '2026-10',
        status: 'fechada',
        fechada_por_id: usuarioId,
        fechada_por_legado: null,
      },
    ]);

    await migrar('aberto');
    expect((await ler()).rows[1]).toMatchObject({ competencia: '2026-10', status: 'aberta' });
  });

  it('grava os dados fiscais e sobrescreve o que mudou no redo-one (o dashboards-one é a fonte)', async () => {
    const ficha = {
      id: 'cl-a',
      contato: null,
      email: null,
      emailEnvioNf: 'nf@prn.com.br; administracao@teleimagem.com.br',
      telefone: null,
      bancoCodigo: null,
      bancoAgencia: null,
      bancoConta: null,
      endereco: 'Rua A',
      enderecoNumero: null,
      complemento: null,
      bairro: null,
      cidade: 'Araraquara',
      estado: 'SP',
      cep: '4553010',
      omieCodigoCliente: '855',
      omieDataSincronizacao: '2026-03-11T03:23:09.850Z',
    };
    const migrar = () =>
      gravarMigracao(
        db,
        catalogo,
        medicos,
        undefined,
        undefined,
        undefined,
        undefined,
        mapearDadosFiscais({ clientes: [ficha], exclusaoFiscal: ['PRN'] }, catalogo.tabelas),
      );
    const ler = async () =>
      (
        await db.execute(
          sql`select c.nome, d.emails_nf, d.cep, d.omie_codigo_cliente, d.exclusao_fiscal
            from clientes_dados_fiscais d join clientes c on c.id = d.cliente_id order by c.nome`,
        )
      ).rows;

    await migrar();
    const primeira = await ler();
    expect(primeira).toEqual([
      {
        nome: 'PRN',
        emails_nf: [],
        cep: null,
        omie_codigo_cliente: null,
        exclusao_fiscal: true,
      },
      {
        nome: 'PRN TELE_ARARAQUARA',
        emails_nf: ['nf@prn.com.br', 'administracao@teleimagem.com.br'],
        cep: '04553010',
        omie_codigo_cliente: '855',
        exclusao_fiscal: false,
      },
    ]);
    await db
      .update(schema.clientesDadosFiscais)
      .set({ emailsNf: ['outro@x.com'] })
      .where(sql`${schema.clientesDadosFiscais.clienteId} = ${idDoLegado('clientes', 'cl-a')}`);
    await migrar();
    expect(await ler()).toEqual(primeira);
  });

  it('grava a tipificação; rodar de novo troca as linhas do cliente da carga e mantém a do cliente fora dela', async () => {
    const tipificacao = mapearTipificacao(
      {
        regras: [
          { id: 'r-co', nome: 'CO', descricao: null, cor: null, ordem: 0, ativo: true },
          { id: 'r-nc', nome: 'NC', descricao: null, cor: null, ordem: 1, ativo: true },
        ],
        subRegras: [
          {
            id: 's-ncnf',
            regraId: 'r-nc',
            nome: 'NC-NF',
            descricao: null,
            ordem: 0,
            ativo: true,
            fatura: false,
          },
          {
            id: 's-ncft',
            regraId: 'r-nc',
            nome: 'NC-FT',
            descricao: null,
            ordem: 1,
            ativo: true,
            fatura: true,
          },
        ],
        clienteRegras: [{ empresa: 'PRN TELE_ARARAQUARA', regraId: 'r-nc', principal: true }],
        clienteSubRegras: [],
        ordens: [
          {
            empresa: 'PRN TELE_ARARAQUARA',
            personalizada: true,
            linhas: [
              {
                tipo: 'especialidade',
                valores: ['NEURO'],
                filtro: { modo: 'apenas', medicos: ['ana'], grupos: ['g1'] },
                subRegraId: 's-ncnf',
              },
              {
                tipo: 'modalidade',
                valores: ['CT'],
                filtro: { modo: 'todos' },
                subRegraId: 's-ncnf',
              },
              { tipo: 'demais', valores: [], filtro: { modo: 'todos' }, subRegraId: 's-ncft' },
            ],
          },
        ],
        grupos: [{ id: 'g1', nome: 'Equipe 1', ativo: true }],
      },
      cadastroDaCarga([], catalogo.tabelas, medicos.tabelas),
    );
    expect(tipificacao.erros).toEqual([]);
    const migrar = () =>
      gravarMigracao(
        db,
        catalogo,
        medicos,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        tipificacao,
      );
    const ler = async () =>
      (
        await db.execute(sql`
          select c.nome cliente, r.nome regra, d.nome demais, l.ordem, l.tipo, l.modo_medico,
            s.nome sub,
            (select count(*)::int from clientes_tipificacao_linhas_especialidades x where x.linha_id = l.id) esp,
            (select count(*)::int from clientes_tipificacao_linhas_modalidades x where x.linha_id = l.id) mods,
            (select count(*)::int from clientes_tipificacao_linhas_medicos x where x.linha_id = l.id) meds,
            (select count(*)::int from clientes_tipificacao_linhas_equipes x where x.linha_id = l.id) eqs
          from clientes_tipificacao t join clientes c on c.id = t.cliente_id
          left join regras_tipificacao r on r.id = t.regra_id
          left join subregras_tipificacao d on d.id = t.subregra_demais_id
          left join clientes_tipificacao_linhas l on l.cliente_id = t.cliente_id
          left join subregras_tipificacao s on s.id = l.subregra_id
          order by c.nome, l.ordem`)
      ).rows;

    await db.execute(sql`delete from graphile_worker._private_jobs`);
    await migrar();
    const job = await db.execute(sql`select key from graphile_worker.jobs`);
    expect(job.rows).toEqual([{ key: 'ingestao.reclassificar-tipificacao:todos' }]);
    const primeira = await ler();
    expect(primeira).toEqual([
      {
        cliente: 'PRN TELE_ARARAQUARA',
        regra: 'NC',
        demais: 'NC-FT',
        ordem: 1,
        tipo: 'especialidade',
        modo_medico: 'apenas',
        sub: 'NC-NF',
        esp: 1,
        mods: 0,
        meds: 1,
        eqs: 1,
      },
      {
        cliente: 'PRN TELE_ARARAQUARA',
        regra: 'NC',
        demais: 'NC-FT',
        ordem: 2,
        tipo: 'modalidade',
        modo_medico: 'todos',
        sub: 'NC-NF',
        esp: 0,
        mods: 1,
        meds: 0,
        eqs: 0,
      },
    ]);
    const regras = await db.execute(
      sql`select nome, fatura_sem_subregra, padrao from regras_tipificacao order by nome`,
    );
    expect(regras.rows).toEqual([
      { nome: 'CO', fatura_sem_subregra: true, padrao: true },
      { nome: 'NC', fatura_sem_subregra: false, padrao: false },
    ]);

    // Linha a mais na tela do redo-one: a carga a troca pela lista do dashboards-one.
    const unidade = idDoLegado('clientes', 'cl-a');
    await db.insert(schema.clientesTipificacaoLinhas).values({
      clienteId: unidade,
      ordem: 3,
      tipo: 'prioridade',
      subregraId: idDoLegado('sub_regras', 's-ncft'),
    });
    // Cliente configurado só no redo-one: fica.
    const outro = idDoLegado('clientes', 'cl-b');
    await db.insert(schema.clientesTipificacao).values({
      clienteId: outro,
      regraId: idDoLegado('regras_categorias', 'r-co'),
    });
    await migrar();
    const segunda = await ler();
    expect(segunda.slice(0, 2)).toEqual(primeira);
    expect(segunda[2]).toMatchObject({ cliente: 'PRN TELE_MARABA', regra: 'CO', ordem: null });
  });

  it('grava os preços pelo id da linha do dashboards-one; rodar de novo não duplica', async () => {
    await db.insert(schema.categoriasExame).values({ id: idDoLegado('t', 'sc'), nome: 'SC' });
    await db.insert(schema.prioridades).values({ id: idDoLegado('t', 'ro'), nome: 'ROTINA' });
    const linha = {
      modalidade: 'CT',
      especialidade: 'NEURO',
      categoria: 'SC',
      prioridade: 'ROTINA',
      valorBase: 51,
      condVolume: null,
      volumeInicial: 1,
      volumeFinal: 2147483647,
      vigenciaDesde: null,
      vigenciaAte: null,
      atualizadoEm: '2026-08-01T00:00:00.000Z',
    };
    const precos = mapearPrecos(
      {
        clientes: [{ ...linha, id: 'p-1', donoId: 'cl-a', donoNome: 'PRN TELE_ARARAQUARA' }],
        padrao: [{ ...linha, id: 'pp-1', donoId: 'ct-tele', donoNome: null, valorBase: 70 }],
      },
      {
        clientes: catalogo.tabelas.clientes,
        contratados: catalogo.tabelas.contratados.map((c) => ({
          id: c.id as string,
          razaoSocial: c.razaoSocial,
        })),
        modalidades: catalogo.tabelas.modalidades.map((m) => ({
          id: m.id as string,
          codigo: m.codigo,
        })),
        especialidades: catalogo.tabelas.especialidades.map((e) => ({
          id: e.id as string,
          nome: e.nome,
        })),
        categorias: [{ id: idDoLegado('t', 'sc'), nome: 'SC' }],
        prioridades: [{ id: idDoLegado('t', 'ro'), nome: 'ROTINA' }],
      },
    );
    expect(precos.naoResolvidas).toEqual([]);
    const migrar = () =>
      gravarMigracao(
        db,
        catalogo,
        medicos,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        precos,
      );
    const ler = async () =>
      (
        await db.execute(sql`
          select 'cliente' tabela, valor::float8 valor, faixa_inicio, faixa_fim from precos_cliente
          union all
          select 'padrao', valor::float8, faixa_inicio, faixa_fim from precos_padrao_contratado
          order by 1`)
      ).rows;
    await migrar();
    await migrar();
    expect(await ler()).toEqual([
      { tabela: 'cliente', valor: 51, faixa_inicio: null, faixa_fim: null },
      { tabela: 'padrao', valor: 70, faixa_inicio: null, faixa_fim: null },
    ]);
  });

  it('o principal que saiu da exclusão fiscal do dashboards-one é desmarcado; o resto dele fica', async () => {
    const migrar = (exclusaoFiscal: string[]) =>
      gravarMigracao(
        db,
        catalogo,
        medicos,
        undefined,
        undefined,
        undefined,
        undefined,
        mapearDadosFiscais({ clientes: [], exclusaoFiscal }, catalogo.tabelas),
      );
    await migrar(['PRN']);
    const principal = idDoLegado('clientes-principal', 'prn');
    await db
      .update(schema.clientesDadosFiscais)
      .set({ emailsNf: ['nf@prn.com.br'] })
      .where(sql`${schema.clientesDadosFiscais.clienteId} = ${principal}`);
    await migrar([]);
    expect(
      (
        await db.execute(
          sql`select emails_nf, exclusao_fiscal from clientes_dados_fiscais where cliente_id = ${principal}`,
        )
      ).rows,
    ).toEqual([{ emails_nf: ['nf@prn.com.br'], exclusao_fiscal: false }]);
  });

  it('grava a escala com cobertura e recortes; rodar de novo não duplica nem sobrescreve o tipo editado', async () => {
    const contarEscala = async () => {
      const r = await db.execute<{ t: string; n: number }>(sql`
        select 'frentes' t, count(*)::int n from frentes_escala union all
        select 'turnos_frentes', count(*)::int from turnos_frentes union all
        select 'alocacoes', count(*)::int from alocacoes union all
        select 'coberturas', count(*)::int from alocacoes where cobertura_de_id is not null union all
        select 'ajustes', count(*)::int from ajustes_produtividade union all
        select 'tipos', count(*)::int from tipos_ausencia union all
        select 'ausencias', count(*)::int from ausencias union all
        select 'ausencias_frentes', count(*)::int from ausencias_frentes union all
        select 'ausencias_turnos', count(*)::int from ausencias_turnos union all
        select 'eventos', count(*)::int from eventos_auditoria`);
      return Object.fromEntries(r.rows.map((l) => [l.t, l.n]));
    };

    await gravarMigracao(db, catalogo, medicos, escala);
    const primeira = await contarEscala();
    await db.execute(sql`update tipos_ausencia set gravidade = 9 where nome = 'Férias'`);
    // Como os tipos da primeira carga, sem cor; e uma cor escolhida na tela.
    await db.execute(sql`update tipos_ausencia set cor = null where nome = 'Folga'`);
    await db.execute(sql`update tipos_ausencia set cor = '#000000' where nome = 'Licença'`);
    await gravarMigracao(db, catalogo, medicos, escala);

    expect(await contarEscala()).toEqual(primeira);
    expect(primeira).toEqual({
      frentes: 1,
      turnos_frentes: 1,
      alocacoes: 2,
      coberturas: 1,
      ajustes: 1,
      tipos: 6,
      ausencias: 1,
      ausencias_frentes: 1,
      ausencias_turnos: 1,
      eventos: 1,
    });
    const ferias = await db.execute<{ gravidade: number }>(
      sql`select gravidade from tipos_ausencia where nome = 'Férias'`,
    );
    expect(ferias.rows).toEqual([{ gravidade: 9 }]);
    const cores = await db.execute<{ nome: string; cor: string | null }>(
      sql`select nome, cor from tipos_ausencia where nome in ('Folga', 'Licença') order by nome`,
    );
    expect(cores.rows).toEqual([
      { nome: 'Folga', cor: '#0E7490' },
      { nome: 'Licença', cor: '#000000' },
    ]);
  });

  it('alocação que veio do dashboards-one e sumiu de lá é encerrada ontem, com auditoria; a criada no redo-one fica', async () => {
    await gravarMigracao(db, catalogo, medicos, escala);
    const titular = idDoLegado('alocacoes_medico', 'a1');
    const copia = async (id: string, dataInicio: string, dataFim: string | null) =>
      db.execute(sql`
        insert into alocacoes (id, medico_id, turno_id, frente_id, dias_semana, horario_inicio,
          horario_fim, data_inicio, data_fim)
        select ${id}::uuid, medico_id, turno_id, frente_id, dias_semana, horario_inicio,
          horario_fim, ${dataInicio}::date, ${dataFim}::date from alocacoes where id = ${titular}`);
    const sumiu = idDoLegado('alocacoes_medico', 'sumiu');
    const antiga = idDoLegado('alocacoes_medico', 'antiga');
    const futura = idDoLegado('alocacoes_medico', 'futura');
    const daTela = '0b4a1f3e-2c7d-4e8a-9f61-3d5c7b9e1a20';
    await copia(sumiu, '2026-01-01', null);
    await copia(antiga, '2026-01-01', '2026-03-01');
    await copia(futura, '2026-12-01', null);
    await copia(daTela, '2026-01-01', null);

    const previa = await alocacoesSumidasDoLegado(db, escala);
    expect(previa.encerrar.map((a) => a.id)).toEqual([sumiu]);
    expect(previa.futuras.map((a) => a.id)).toEqual([futura]);

    await gravarMigracao(db, catalogo, medicos, escala);

    const fim = async (id: string) =>
      (
        await db.execute<{ data_fim: string | null }>(
          sql`select to_char(data_fim, 'YYYY-MM-DD') data_fim from alocacoes where id = ${id}`,
        )
      ).rows[0]?.data_fim;
    expect(await fim(sumiu)).toBe('2026-11-15');
    expect(await fim(antiga)).toBe('2026-03-01');
    expect(await fim(futura)).toBeNull();
    expect(await fim(daTela)).toBeNull();
    expect(await fim(titular)).toBeNull();
    const eventos = await db.execute<{ ator_tipo: string; acao: string; antes: unknown }>(
      sql`select ator_tipo, acao, antes from eventos_auditoria
        where entidade = 'alocacao' and entidade_id = ${sumiu}`,
    );
    expect(eventos.rows).toEqual([
      { ator_tipo: 'sistema', acao: 'encerrado', antes: { dataFim: null } },
    ]);

    // Rodar de novo não encerra de novo nem duplica o evento.
    await gravarMigracao(db, catalogo, medicos, escala);
    expect(
      (await db.execute(sql`select 1 from eventos_auditoria where entidade_id = ${sumiu}`)).rows,
    ).toHaveLength(1);
  });

  it('ausência que veio do dashboards-one e sumiu de lá é recusada, com auditoria; a criada no redo-one fica', async () => {
    await gravarMigracao(db, catalogo, medicos, escala);
    const original = idDoLegado('ausencias_medico', 'au1');
    const copia = async (id: string) =>
      db.execute(sql`
        insert into ausencias (id, medico_id, tipo_id, data_inicio, data_fim, situacao, origem)
        select ${id}::uuid, medico_id, tipo_id, data_inicio, data_fim, situacao, origem
        from ausencias where id = ${original}`);
    const sumiu = idDoLegado('ausencias_medico', 'sumiu');
    const daTela = '6c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
    await copia(sumiu);
    await copia(daTela);

    const previa = await ausenciasSumidasDoLegado(db, escala);
    expect(previa.map((a) => a.id)).toEqual([sumiu]);

    await gravarMigracao(db, catalogo, medicos, escala);

    const situacao = async (id: string) =>
      (
        await db.execute<{ situacao: string; motivo_recusa: string | null }>(
          sql`select situacao, motivo_recusa from ausencias where id = ${id}`,
        )
      ).rows[0];
    expect(await situacao(sumiu)).toEqual({
      situacao: 'recusada',
      motivo_recusa: 'Apagada no dashboards-one: recusada pela carga.',
    });
    expect((await situacao(daTela))?.situacao).toBe('aprovada');
    expect((await situacao(original))?.situacao).toBe('aprovada');
    const eventos = await db.execute<{ ator_tipo: string; acao: string; depois: unknown }>(
      sql`select ator_tipo, acao, depois from eventos_auditoria
        where entidade = 'ausencia' and entidade_id = ${sumiu}`,
    );
    expect(eventos.rows).toEqual([
      {
        ator_tipo: 'sistema',
        acao: 'recusada',
        depois: {
          medicoId: expect.any(String),
          frenteIds: [],
          turnoIds: [],
          situacao: 'recusada',
          motivoRecusaAlterado: true,
        },
      },
    ]);

    await gravarMigracao(db, catalogo, medicos, escala);
    expect(
      (await db.execute(sql`select 1 from eventos_auditoria where entidade_id = ${sumiu}`)).rows,
    ).toHaveLength(1);
  });

  it('frente já criada pela tela (id aleatório) é reaproveitada, e rodar duas vezes não duplica', async () => {
    const [daCarga] = escala.tabelas.frentesEscala;
    if (!daCarga?.especialidadeId) throw new Error('a escala de teste precisa de uma frente');
    await gravarMigracao(db, catalogo, medicos);
    const daTela = '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
    await db.insert(schema.frentesEscala).values({
      id: daTela,
      tipo: 'especialidade',
      especialidadeId: daCarga.especialidadeId,
    });

    await gravarMigracao(db, catalogo, medicos, escala);
    await gravarMigracao(db, catalogo, medicos, escala);

    const usos = await db.execute<{ t: string; frente: string }>(sql`
      select 'frentes' t, id::text frente from frentes_escala union all
      select 'turnos_frentes', frente_id::text from turnos_frentes union all
      select 'alocacoes', frente_id::text from alocacoes union all
      select 'ausencias_frentes', frente_id::text from ausencias_frentes
      order by 1, 2`);
    expect(usos.rows).toEqual([
      { t: 'alocacoes', frente: daTela },
      { t: 'alocacoes', frente: daTela },
      { t: 'ausencias_frentes', frente: daTela },
      { t: 'frentes', frente: daTela },
      { t: 'turnos_frentes', frente: daTela },
    ]);
    const eventos = await db.execute<{ json: string }>(
      sql`select concat(entidade_id, antes::text, depois::text) json from eventos_auditoria`,
    );
    expect(eventos.rows.some((l) => l.json.includes(daCarga.id))).toBe(false);
    expect(eventos.rows.some((l) => l.json.includes(daTela))).toBe(true);
  });

  it('valor fora do padrão casa pela grafia: regravar com outro id não quebra a chave única', async () => {
    const valor = {
      id: '00000000-0000-5000-8000-000000000001',
      estudoDescricao: 'Lombar',
      chaveNormalizada: 'lombar',
      valores: 0,
      exameId: null,
      ativo: true,
    };
    const com = (v: typeof valor) => ({
      ...catalogo,
      tabelas: { ...catalogo.tabelas, examesDeParaValores: [v] },
    });

    await gravarMigracao(db, com(valor), medicos);
    await gravarMigracao(
      db,
      com({
        ...valor,
        id: '00000000-0000-5000-8000-000000000002',
        estudoDescricao: 'LOMBAR',
        valores: 1,
      }),
      medicos,
    );

    const linhas = await db.execute<{ estudo_descricao: string; valores: string }>(
      sql`select estudo_descricao, valores from exames_de_para_valores`,
    );
    expect(linhas.rows).toEqual([{ estudo_descricao: 'LOMBAR', valores: '1.00' }]);
  });

  it('descrição vazia no dashboards-one não apaga a que foi preenchida no redo-one', async () => {
    await gravarMigracao(db, catalogo, medicos);
    await db.execute(sql`update modalidades set descricao = 'Tomografia Computadorizada'`);

    await gravarMigracao(db, catalogo, medicos);

    const linhas = await db.execute<{ descricao: string }>(sql`select descricao from modalidades`);
    expect(linhas.rows).toEqual([{ descricao: 'Tomografia Computadorizada' }]);
  });

  it('a conta MobileMed mapeada no redo-one fica; vazia, vem a do dashboards-one', async () => {
    await gravarMigracao(db, catalogo, medicos);
    await db.execute(sql`update medicos set id_mobilemed = 99`);

    await gravarMigracao(db, catalogo, medicos);
    expect((await db.execute(sql`select id_mobilemed from medicos`)).rows).toEqual([
      { id_mobilemed: 99 },
    ]);

    await db.execute(sql`update medicos set id_mobilemed = null`);
    await gravarMigracao(db, catalogo, medicos);
    expect((await db.execute(sql`select id_mobilemed from medicos`)).rows).toEqual([
      { id_mobilemed: 7 },
    ]);
  });

  it('cor vazia no dashboards-one não apaga a escolhida no redo-one', async () => {
    await gravarMigracao(db, catalogo, medicos);
    await db.execute(sql`update modalidades set cor = '#F58231'`);

    await gravarMigracao(db, catalogo, medicos);

    const linhas = await db.execute<{ cor: string }>(sql`select cor from modalidades`);
    expect(linhas.rows).toEqual([{ cor: '#F58231' }]);
  });

  it('cor escolhida no redo-one vale mais que a do dashboards-one; vazia, vem a de lá', async () => {
    const comCor = {
      ...catalogo,
      tabelas: {
        ...catalogo.tabelas,
        modalidades: catalogo.tabelas.modalidades.map((m) => ({ ...m, cor: '#111111' })),
      },
    };
    await gravarMigracao(db, comCor, medicos);
    const primeira = await db.execute<{ cor: string }>(sql`select cor from modalidades`);
    expect(primeira.rows).toEqual([{ cor: '#111111' }]);

    await db.execute(sql`update modalidades set cor = '#C9804A'`);
    await gravarMigracao(db, comCor, medicos);

    const linhas = await db.execute<{ cor: string }>(sql`select cor from modalidades`);
    expect(linhas.rows).toEqual([{ cor: '#C9804A' }]);
  });

  it('ajuste que a tela já criou para a mesma alocação e dia é sobrescrito pelo do dashboards-one', async () => {
    await gravarMigracao(db, catalogo, medicos, escala);
    const [ajuste] = escala.tabelas.ajustesProdutividade;
    if (!ajuste) throw new Error('a escala de teste precisa de um ajuste');
    await db.delete(schema.ajustesProdutividade);
    await db.insert(schema.ajustesProdutividade).values({
      ...ajuste,
      id: '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5c',
      produtividade: 99,
    });

    await gravarMigracao(db, catalogo, medicos, escala);

    const linhas = await db.execute<{ id: string; produtividade: number }>(
      sql`select id::text, produtividade from ajustes_produtividade`,
    );
    expect(linhas.rows).toEqual([{ id: ajuste.id, produtividade: ajuste.produtividade }]);
  });

  it('recorte da gestora é trocado inteiro: a linha antiga que a carga não traz mais sai', async () => {
    await db.execute(sql`truncate table usuarios, papeis cascade`);
    const [usuaria] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Gestora', email: 'gestora@tele.com' })
      .returning({ id: schema.usuarios.id });
    const usuarioId = usuaria?.id as string;
    const turnoId = escala.tabelas.turnos[0]?.id as string;
    const frenteId = escala.tabelas.frentesEscala[0]?.id as string;
    const comEscopo = (escopos: EscalaMigrada['tabelas']['usuariosEscoposEscala']) => ({
      ...escala,
      tabelas: { ...escala.tabelas, usuariosEscoposEscala: escopos },
    });

    await gravarMigracao(
      db,
      catalogo,
      medicos,
      comEscopo([
        { id: '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a51', usuarioId, frenteId, turnoId: null },
      ]),
    );
    await gravarMigracao(
      db,
      catalogo,
      medicos,
      comEscopo([
        { id: '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a52', usuarioId, turnoId, frenteId: null },
      ]),
    );

    const linhas = await db.execute<{ turno: string | null; frente: string | null }>(
      sql`select turno_id::text turno, frente_id::text frente from usuarios_escopos_escala`,
    );
    expect(linhas.rows).toEqual([{ turno: turnoId, frente: null }]);
  });

  it('grava os arranjos e o robô; rodar de novo troca a lista do médico pela do dashboards-one', async () => {
    const arranjo = {
      especialidadeId: 'es-neuro',
      modalidades: ['CT'],
      subespecialidades: [],
      prioridades: [],
      modoClientes: 'todos',
      clientes: [],
      modoExames: 'todos',
      exames: [],
      ordem: 0,
      ativo: true,
    };
    const distribuicao = mapearDistribuicao(
      {
        arranjosMedico: [{ ...arranjo, id: 'r1', medicoId: 'm1', clientesExclusivos: [] }],
        arranjosEquipe: [{ ...arranjo, id: 'q1', equipeId: 'e1' }],
        habilitados: ['m1'],
      },
      {
        legadoCatalogo,
        catalogo: catalogo.tabelas,
        medicos: medicos.tabelas,
        prioridadesOperacao: [],
      },
    );
    const contar = async () => {
      const r = await db.execute<{ t: string; n: number }>(sql`
        select 'arranjos' t, count(*)::int n from arranjos union all
        select 'modalidades', count(*)::int from arranjos_modalidades union all
        select 'habilitados', count(*)::int from medicos_distribuicao where habilitado_robo`);
      return Object.fromEntries(r.rows.map((l) => [l.t, l.n]));
    };

    await gravarMigracao(db, catalogo, medicos, undefined, distribuicao);
    const primeira = await contar();
    // Um arranjo criado no redo-one para o mesmo médico: a carga devolve a lista de lá.
    await db.execute(
      sql`insert into arranjos (medico_id) select medico_id from arranjos where medico_id is not null limit 1`,
    );
    await gravarMigracao(db, catalogo, medicos, undefined, distribuicao);

    expect(await contar()).toEqual(primeira);
    expect(primeira).toEqual({ arranjos: 2, modalidades: 2, habilitados: 1 });
  });

  it('configuração do robô: grava a global, as regras da frente e a prioridade do cliente; de novo, igual', async () => {
    await gravarMigracao(db, catalogo, medicos, escala);
    const neuro = catalogo.tabelas.especialidades[0]?.id as string;
    const ct = catalogo.tabelas.modalidades[0]?.id as string;
    const clienteId = catalogo.tabelas.clientes[0]?.id as string;
    const tarde = escala.tabelas.turnos[0]?.id as string;
    const migrada: ConfiguracaoDistribuicaoMigrada = {
      configuracao: {
        ...CONFIGURACAO_INICIAL,
        marcadoresEquilibrio: ['ONCO'],
        turnosPosteriores: { turnoIds: [tarde], cheiaEm: '10:50' },
      },
      prioridadesOperacao: [
        {
          id: '5b8c1b5e-0000-4000-8000-000000000001',
          nome: 'ROTINA',
          posicao: 3,
          urgencia: { tipo: 'nunca' },
          furaGradeNaAlocacao: false,
          padrao: true,
          grafias: ['P4', 'Rotina'],
          cor: null,
        },
      ],
      gradeRecebimento: [
        {
          prioridadeOperacaoId: '5b8c1b5e-0000-4000-8000-000000000001',
          turnoId: tarde,
          regra: { tipo: 'prazo_minimo', horas: 24 },
        },
      ],
      regrasFrente: [
        {
          frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: ct },
          ...REGRAS_NEUTRAS,
          horariosSemRobo: [{ diasSemana: [], inicio: '19:00', fim: '07:00' }],
        },
        {
          frente: { tipo: 'especialidade', especialidadeId: neuro, modalidadeId: null },
          ...REGRAS_NEUTRAS,
          recolheAoFimDoTurno: false,
          recebimento: [
            {
              prioridadeOperacaoId: '5b8c1b5e-0000-4000-8000-000000000001',
              turnoId: tarde,
              regra: { tipo: 'segue_sla' },
            },
          ],
        },
      ],
      prioridadesCliente: [
        {
          clienteId,
          itens: [
            {
              frente: { tipo: 'especialidade', especialidadeId: neuro, modalidadeId: null },
              nivel: 1,
            },
          ],
        },
      ],
      avisos: [],
      resumo: {},
    };
    const ler = async () => ({
      configuracao: await new DrizzleConfiguracaoDistribuicaoRepository(db).obter(),
      regras: await new DrizzleRegrasFrenteRepository(db).listar(),
      prioridades: await new DrizzlePrioridadesClienteRepository(db).todas(),
      operacao: await new DrizzlePrioridadesOperacaoRepository(db).listar(),
      grade: await new DrizzlePrioridadesOperacaoRepository(db).obterGrade(),
    });
    await gravarMigracao(db, catalogo, medicos, escala, undefined, migrada);
    const primeira = await ler();
    await gravarMigracao(db, catalogo, medicos, escala, undefined, migrada);
    expect(await ler()).toEqual(primeira);
    expect(primeira.configuracao).toEqual(migrada.configuracao);
    expect(primeira.regras).toHaveLength(2);
    expect(primeira.operacao).toEqual(migrada.prioridadesOperacao);
    expect(primeira.grade).toEqual(migrada.gradeRecebimento);
    expect(primeira.prioridades).toEqual([
      { clienteId, ...migrada.prioridadesCliente[0]?.itens[0] },
    ]);

    // A cor é dado da tela: a carga (que não traz cor) não apaga a que foi escolhida.
    await db.execute(sql`update prioridades_operacao set cor = '#5A9A64' where nome = 'ROTINA'`);
    await gravarMigracao(db, catalogo, medicos, escala, undefined, migrada);
    expect((await ler()).operacao[0]?.cor).toBe('#5A9A64');
  });
});
