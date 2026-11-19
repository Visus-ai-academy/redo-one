import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { FrenteEscala } from '../../domain/arranjo';
import { CONFIGURACAO_INICIAL } from '../../domain/configuracao-global';
import { REGRAS_NEUTRAS, type RegrasFrente } from '../../domain/motor/configuracao';
import { EscalaDoAjusteAdapter } from '../escala/escala-do-ajuste.adapter';
import { DrizzleAjustesDiaRepository } from './drizzle-ajustes-dia.repository';
import { DrizzleCadastrosDistribuicao } from './drizzle-cadastros-distribuicao';
import { DrizzleConfiguracaoDistribuicaoRepository } from './drizzle-configuracao-distribuicao.repository';
import { DrizzlePrioridadesClienteRepository } from './drizzle-prioridades-cliente.repository';
import { DrizzlePrioridadesOperacaoRepository } from './drizzle-prioridades-operacao.repository';
import { DrizzleRegrasFrenteRepository } from './drizzle-regras-frente.repository';

const url = process.env.TEST_DATABASE_URL;
const NENHUM = '00000000-0000-0000-0000-000000000000';

describe.skipIf(!url)('configuração do robô (banco)', () => {
  let pool: Pool;
  let db: Database;
  const ids: Record<string, string> = {};
  const id = (k: string) => ids[k] ?? '';
  const primeiro = async (p: Promise<{ id: string }[]>) => (await p)[0]?.id ?? '';

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table ajustes_dia_distribuicao, alocacoes, frentes_escala, usuarios, papeis, medicos, prioridades_cliente, regras_frente, configuracao_distribuicao, prioridades_operacao,
        configuracao_distribuicao_turnos_posteriores,
        turnos, clientes, modalidades, especialidades, subespecialidades, prioridades cascade`,
    );
    ids.urg = await primeiro(
      db.insert(schema.prioridades).values({ nome: 'URGÊNCIA' }).returning(),
    );
    ids.rot = await primeiro(db.insert(schema.prioridades).values({ nome: 'ROTINA' }).returning());
    ids.ct = await primeiro(db.insert(schema.modalidades).values({ codigo: 'CT' }).returning());
    ids.mr = await primeiro(db.insert(schema.modalidades).values({ codigo: 'MR' }).returning());
    ids.neuro = await primeiro(
      db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning(),
    );
    ids.cp = await primeiro(
      db.insert(schema.subespecialidades).values({ nome: 'CABEÇA E PESCOÇO' }).returning(),
    );
    ids.cli = await primeiro(
      db
        .insert(schema.clientes)
        .values({ nome: 'CLINICA X', chaveNormalizada: 'clinica x' })
        .returning(),
    );
    ids.tarde = await primeiro(
      db
        .insert(schema.turnos)
        .values({ nome: 'Tarde', horarioInicio: '13:00', horarioFim: '19:00' })
        .returning(),
    );
    ids.opRot = await primeiro(
      db
        .insert(schema.prioridadesOperacao)
        .values({ nome: 'ROTINA', posicao: 3, urgencia: 'nunca' })
        .returning(),
    );
  });

  it('configuração global: sem linha é null; grava, lê e troca as listas', async () => {
    const repo = new DrizzleConfiguracaoDistribuicaoRepository(db);
    expect(await repo.obter()).toBeNull();
    const producao = {
      ...CONFIGURACAO_INICIAL,
      marcadoresEquilibrio: ['ONCO'],
      turnosPosteriores: { turnoIds: [id('tarde')], cheiaEm: '10:50' },
    };
    await repo.salvar(producao);
    expect(await repo.obter()).toEqual(producao);

    const semPosteriores = {
      ...producao,
      turnosPosteriores: null,
      recolhimentoAposTurnoMin: null,
    };
    await repo.salvar(semPosteriores);
    expect(await repo.obter()).toEqual(semPosteriores);
  });

  it('cadastros: diz quais tipos têm id que não existe', async () => {
    const cad = new DrizzleCadastrosDistribuicao(db);
    expect(
      await cad.faltando({
        prioridade: [id('urg'), id('rot'), id('urg')],
        turno: [id('tarde')],
        especialidade: [id('neuro')],
        modalidade: [id('ct')],
        subespecialidade: [id('cp')],
        cliente: [id('cli')],
      }),
    ).toEqual([]);
    expect(
      await cad.faltando({ prioridade: [id('urg'), NENHUM], turno: [], cliente: [NENHUM] }),
    ).toEqual(['prioridade', 'cliente']);
  });

  it('regras da frente: grava tudo, lê igual, troca inteiro e separa especialidade de modalidade', async () => {
    const repo = new DrizzleRegrasFrenteRepository(db);
    const neuro: FrenteEscala = {
      tipo: 'especialidade',
      especialidadeId: id('neuro'),
      modalidadeId: null,
    };
    const ct: FrenteEscala = { tipo: 'modalidade', especialidadeId: null, modalidadeId: id('ct') };
    expect(await repo.obter(neuro)).toBeNull();

    const cheia: RegrasFrente = {
      frente: neuro,
      urgencias: [{ prioridadeOperacaoId: id('opRot'), urgencia: { tipo: 'prazo', horas: 6 } }],
      recebimento: [
        {
          prioridadeOperacaoId: id('opRot'),
          turnoId: id('tarde'),
          regra: { tipo: 'prazo_minimo', horas: 48 },
        },
      ],
      recolheAoFimDoTurno: false,
      distribuiPeloRobo: true,
      horariosSemRobo: [{ diasSemana: [1, 5], inicio: '19:00', fim: '07:00' }],
      divisao: {
        metodo: 'proporcao',
        proporcoes: [
          { modalidadeId: id('ct'), percentual: 40 },
          { modalidadeId: id('mr'), percentual: 60 },
        ].sort((a, b) => (a.modalidadeId < b.modalidadeId ? -1 : 1)),
      },
      tetoPorMedico: 30,
      segmentos: [
        {
          subespecialidadeId: id('cp'),
          teto: 7,
          tetoReduzido: { produtividadeAte: 15, teto: 4 },
          piso: null,
          pacoteAParte: false,
        },
      ],
      mistura: [
        { especialidadeId: null, subespecialidadeId: id('cp') },
        { especialidadeId: id('neuro'), subespecialidadeId: null },
      ],
      listaDepoisDosFixos: true,
    };
    await repo.salvar(cheia);
    expect(await repo.obter(neuro)).toEqual(cheia);

    // Sem sobrescritas = seguem as gerais; troca inteira some com as filhas.
    const neutra = { frente: neuro, ...REGRAS_NEUTRAS };
    await repo.salvar(neutra);
    expect(await repo.obter(neuro)).toEqual(neutra);

    const plantao = {
      ...REGRAS_NEUTRAS,
      frente: ct,
      recebimento: [
        {
          prioridadeOperacaoId: id('opRot'),
          turnoId: id('tarde'),
          regra: { tipo: 'nao_recebe' as const },
        },
      ],
      horariosSemRobo: [{ diasSemana: [], inicio: '19:00', fim: '07:00' }],
    };
    await repo.salvar(plantao);
    expect(await repo.obter(ct)).toEqual(plantao);
    expect(await repo.listar()).toEqual([neutra, plantao]);
  });

  it('prioridades da operação: cria, troca o de-para, move a padrão, grava a grade e exclui em cascata', async () => {
    const repo = new DrizzlePrioridadesOperacaoRepository(db);
    const urg = await repo.criar({
      nome: 'URGÊNCIA',
      posicao: 1,
      urgencia: { tipo: 'sempre' },
      furaGradeNaAlocacao: true,
      padrao: true,
      grafias: ['Emergência', 'P1'],
      cor: null,
    });
    const amb = await repo.criar({
      nome: 'AMBULATÓRIO',
      posicao: 2,
      urgencia: { tipo: 'prazo', horas: 24 },
      furaGradeNaAlocacao: false,
      padrao: false,
      grafias: ['Ambulatório'],
      cor: null,
    });
    await repo.salvar({
      id: amb,
      nome: 'AMBULATÓRIO',
      posicao: 2,
      urgencia: { tipo: 'prazo', horas: 12 },
      furaGradeNaAlocacao: false,
      padrao: true,
      grafias: ['Ambulatório', 'P6'],
      cor: '#5677B8',
    });
    const lidas = await repo.listar();
    // Pela posição: URGÊNCIA (1), AMBULATÓRIO (2), ROTINA (3, a do beforeEach).
    expect(lidas.map((p) => [p.nome, p.padrao, p.grafias])).toEqual([
      ['URGÊNCIA', false, ['Emergência', 'P1']],
      ['AMBULATÓRIO', true, ['Ambulatório', 'P6']],
      ['ROTINA', false, []],
    ]);
    expect(lidas.find((p) => p.id === amb)?.urgencia).toEqual({ tipo: 'prazo', horas: 12 });
    expect(lidas.find((p) => p.id === amb)?.cor).toBe('#5677B8');
    // A grafia é única no de-para (sem acento e sem maiúsculas).
    const urgencia = lidas.find((p) => p.id === urg);
    if (!urgencia) throw new Error('URGÊNCIA não gravada');
    await expect(repo.salvar({ ...urgencia, grafias: ['ambulatorio'] })).rejects.toThrow();

    const celulas = [
      {
        prioridadeOperacaoId: amb,
        turnoId: id('tarde'),
        regra: { tipo: 'prazo_minimo' as const, horas: 24 },
      },
      { prioridadeOperacaoId: urg, turnoId: id('tarde'), regra: { tipo: 'nao_recebe' as const } },
    ];
    await repo.salvarGrade(celulas);
    expect(await repo.obterGrade()).toEqual(
      [...celulas].sort((a, b) => (a.prioridadeOperacaoId < b.prioridadeOperacaoId ? -1 : 1)),
    );
    await repo.excluir(amb);
    expect(await repo.obterGrade()).toEqual([celulas[1]]);
    expect((await repo.listar()).map((p) => p.nome)).toEqual(['URGÊNCIA', 'ROTINA']);
  });

  it('prioridade do cliente: troca a lista do cliente e lê no formato do motor', async () => {
    const repo = new DrizzlePrioridadesClienteRepository(db);
    const neuro: FrenteEscala = {
      tipo: 'especialidade',
      especialidadeId: id('neuro'),
      modalidadeId: null,
    };
    const ct: FrenteEscala = { tipo: 'modalidade', especialidadeId: null, modalidadeId: id('ct') };
    expect(await repo.doCliente(id('cli'))).toEqual([]);
    await repo.substituir(id('cli'), [
      { frente: ct, nivel: 2 },
      { frente: neuro, nivel: 1 },
    ]);
    expect(await repo.doCliente(id('cli'))).toEqual([
      { frente: neuro, nivel: 1 },
      { frente: ct, nivel: 2 },
    ]);
    expect(await repo.todas()).toHaveLength(2);
    await repo.substituir(id('cli'), [{ frente: ct, nivel: 1 }]);
    expect(await repo.todas()).toEqual([{ clienteId: id('cli'), frente: ct, nivel: 1 }]);
  });

  it('ajuste do dia: grava, troca pelas mesmas alocação e data, lista, remove; adaptador da escala', async () => {
    // O ajuste do dia libera prioridades da operação (com a ROTINA do beforeEach).
    ids.opInt = await primeiro(
      db
        .insert(schema.prioridadesOperacao)
        .values({ nome: 'INTERNADO', posicao: 3, urgencia: 'sempre' })
        .returning(),
    );
    const medico = await primeiro(
      db.insert(schema.medicos).values({ nome: 'Ana', chaveNormalizada: 'ana' }).returning(),
    );
    const frente = await primeiro(
      db
        .insert(schema.frentesEscala)
        .values({ tipo: 'especialidade', especialidadeId: id('neuro') })
        .returning(),
    );
    const outraFrente = await primeiro(
      db
        .insert(schema.frentesEscala)
        .values({ tipo: 'modalidade', modalidadeId: id('ct') })
        .returning(),
    );
    // 2026-11-18 é quarta (3).
    const alocacao = await primeiro(
      db
        .insert(schema.alocacoes)
        .values({
          medicoId: medico,
          turnoId: id('tarde'),
          frenteId: frente,
          diasSemana: [3],
          horarioInicio: '13:00',
          horarioFim: '19:00',
          dataInicio: '2026-11-01',
        })
        .returning(),
    );
    const repo = new DrizzleAjustesDiaRepository(db);
    expect(await repo.obter(alocacao, '2026-11-18')).toBeNull();
    const base = {
      id: '11111111-1111-4111-8111-111111111111',
      alocacaoId: alocacao,
      data: '2026-11-18',
      prioridadeIdsLiberadas: [id('opInt')],
      segueSla: false,
      clienteId: null,
      laudosExtra: 0,
    };
    await repo.salvar(base);
    await repo.salvar({
      ...base,
      prioridadeIdsLiberadas: [id('opRot'), id('opInt')].sort(),
      segueSla: true,
      clienteId: id('cli'),
      laudosExtra: 30,
    });
    const lido = await repo.obter(alocacao, '2026-11-18');
    expect(lido).toEqual({
      ...base,
      prioridadeIdsLiberadas: [id('opRot'), id('opInt')].sort(),
      segueSla: true,
      clienteId: id('cli'),
      laudosExtra: 30,
      clienteNome: 'CLINICA X',
      medicoId: medico,
      turnoId: id('tarde'),
      frenteId: frente,
    });
    expect(await repo.listar({ de: '2026-11-01', ate: '2026-11-30' })).toHaveLength(1);
    expect(await repo.listar({ de: '2026-11-01', ate: '2026-11-30', medicoId: NENHUM })).toEqual(
      [],
    );
    expect(await repo.listar({ de: '2026-11-19', ate: '2026-11-30' })).toEqual([]);
    await repo.remover(base.id);
    expect(await repo.obter(alocacao, '2026-11-18')).toBeNull();

    const escala = new EscalaDoAjusteAdapter(db);
    const admin = { usuarioId: NENHUM, acessoTotal: true };
    expect(await escala.alocacaoNoRecorte(admin, alocacao)).toEqual({
      id: alocacao,
      medicoId: medico,
      turnoId: id('tarde'),
      frenteId: frente,
    });
    expect(await escala.ehDiaDePlantao(alocacao, '2026-11-18')).toBe(true);
    expect(await escala.ehDiaDePlantao(alocacao, '2026-11-19')).toBe(false);
    const papel = await primeiro(db.insert(schema.papeis).values({ nome: 'Gestora' }).returning());
    const gestora = await primeiro(
      db
        .insert(schema.usuarios)
        .values({ nome: 'G', email: 'g@x.com', papelId: papel })
        .returning(),
    );
    await db
      .insert(schema.usuariosEscoposEscala)
      .values({ usuarioId: gestora, frenteId: outraFrente });
    const ator = { usuarioId: gestora, acessoTotal: false };
    expect(await escala.alocacaoNoRecorte(ator, alocacao)).toBeNull();
    const noRecorte = await escala.recorteDo(ator);
    expect(noRecorte({ turnoId: id('tarde'), frenteId: outraFrente })).toBe(true);
    expect(noRecorte({ turnoId: id('tarde'), frenteId: frente })).toBe(false);
  });
});
