import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
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
import { gravarMigracao } from './gravar';
import type { LegadoCatalogo } from './legado';
import { mapearCatalogo } from './mapear-catalogo';
import type { ConfiguracaoDistribuicaoMigrada } from './mapear-configuracao-distribuicao';
import { mapearDistribuicao } from './mapear-distribuicao';
import { type EscalaMigrada, mapearEscala } from './mapear-escala';
import { mapearMedicos } from './mapear-medicos';

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
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table configuracao_distribuicao, regras_frente, prioridades_cliente, prioridades_operacao, arranjos, medicos_distribuicao, clientes, contratados, exames, modalidades, especialidades, medicos, equipes, turnos, frentes_escala, tipos_ausencia, eventos_auditoria cascade`,
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
    const [papel] = await db
      .insert(schema.papeis)
      .values({ nome: 'Gestão de escala' })
      .returning({ id: schema.papeis.id });
    const [usuaria] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Gestora', email: 'gestora@tele.com', papelId: papel?.id as string })
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
