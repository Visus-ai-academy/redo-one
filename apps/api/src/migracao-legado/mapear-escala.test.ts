import { describe, expect, it } from 'vitest';

import { idDoLegado } from './comum';
import type { LegadoCatalogo, LegadoEscala, LegadoMedicos } from './legado';
import { mapearCatalogo } from './mapear-catalogo';
import { type ContextoEscala, mapearEscala } from './mapear-escala';
import { mapearMedicos } from './mapear-medicos';

const lista = { descricao: null, cor: null, ordem: 0, ativo: true };

const legadoCatalogo: LegadoCatalogo = {
  modalidades: ['CT', 'RX', 'DO', 'OT', 'MG'].map((nome) => ({
    id: `mo-${nome}`,
    nome,
    ...lista,
  })),
  especialidades: [
    { id: 'es-neuro', nome: 'NEURO', ...lista },
    { id: 'es-mama', nome: 'MAMA', ...lista },
    { id: 'es-mamo', nome: 'MAMO', ...lista },
    { id: 'es-geral', nome: 'GERAL', ...lista },
    { id: 'es-tc', nome: 'TC', ...lista, modalidade: 'CT' },
    { id: 'es-d.o', nome: 'D.O', ...lista, modalidade: 'OT' },
    { id: 'es-do', nome: 'DO', ...lista, modalidade: 'DO' },
    { id: 'es-rx', nome: 'RX', ...lista, modalidade: 'RX' },
    { id: 'es-mg', nome: 'MG', ...lista, modalidade: 'MG' },
  ],
  subespecialidades: [
    { id: 'su-avc', nome: 'AVC', ...lista },
    { id: 'su-sem', nome: '(SEM SUBESPECIALIDADE)', ...lista },
  ],
  subespecialidadesEspecialidades: [],
  categorias: [],
  prioridades: [
    { id: 'pr-rot', nome: 'ROTINA', ...lista },
    { id: 'pr-urg', nome: 'URGÊNCIA', ...lista },
  ],
  prioridadesUrgentes: ['URGÊNCIA'],
  prioridadesDePara: [
    { id: 'pd-amb', prioridadeOriginal: 'Ambulatório', nomeFinal: 'ROTINA', ativo: true },
    { id: 'pd-int', prioridadeOriginal: 'Internado', nomeFinal: 'ROTINA', ativo: true },
    { id: 'pd-eme', prioridadeOriginal: 'Emergência', nomeFinal: 'URGÊNCIA', ativo: true },
  ],
  especialidadeRegras: [],
  exames: [],
  regrasQuebra: [],
  examesForaPadrao: [],
  contratados: [],
  clientes: [],
  clientesOcultos: [],
  clienteNomeAliases: [],
  clienteApelidos: [],
};

type Medico = LegadoMedicos['medicos'][number];
const medico = (id: string, nome: string, ativo = true): Medico => ({
  id,
  nome,
  crm: null,
  idMobilemed: null,
  email: null,
  telefone: null,
  ativo,
  senior: false,
  fellowship: false,
  funcao: null,
  nivel: null,
  dataInicioVinculo: null,
  observacoes: null,
  cpf: null,
  cnpj: null,
  nomeEmpresa: null,
  tipoChavePix: null,
  chavePix: null,
  socio: null,
  optanteSimples: null,
  omieCodigoFornecedor: null,
});

const contexto: ContextoEscala = {
  legadoCatalogo,
  catalogo: mapearCatalogo(legadoCatalogo).tabelas,
  medicos: mapearMedicos({
    medicos: [medico('m1', 'Dra. Ana'), medico('m2', 'Dr. Bruno'), medico('m3', 'Dr. Caio', false)],
    aliases: [],
    equipes: [],
    equipesMembros: [],
  }).tabelas,
  usuarios: [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'gestora@tele.com' }],
  hoje: '2026-11-16',
};

const turno = (
  id: string,
  nome: string,
  extra: Partial<LegadoEscala['turnos'][number]> = {},
): LegadoEscala['turnos'][number] => ({
  id,
  nome,
  tipo: 'fixo',
  horarioInicio: '07:00',
  horarioFim: '13:00',
  cor: '#214037',
  ordem: 0,
  ativo: true,
  ...extra,
});

type Alocacao = LegadoEscala['alocacoes'][number];
const alocacao = (id: string, extra: Partial<Alocacao> = {}): Alocacao => ({
  id,
  turnoId: 't-manha',
  especialidadeId: 'es-neuro',
  medicoId: 'm1',
  diasSemana: [1, 2],
  semanasDoMes: [],
  horarioInicio: '07:00',
  horarioFim: '13:00',
  dataInicio: '2026-01-01',
  dataFim: null,
  status: 'ativo',
  produtividade: 10,
  prioridades: [],
  subespecialidades: [],
  gratificado: false,
  observacoes: null,
  coberturaDeId: null,
  criadoEm: '2026-01-01T10:00:00.000Z',
  ...extra,
});

function escala(extra: Partial<LegadoEscala> = {}): LegadoEscala {
  return {
    turnos: [turno('t-manha', 'Manhã')],
    turnosEspecialidades: [],
    alocacoes: [],
    ajustes: [],
    ausencias: [],
    logs: [],
    usuarios: [],
    ...extra,
  };
}

const idEspecialidade = (legadoId: string) => idDoLegado('especialidades', legadoId);
const idModalidade = (legadoId: string) => idDoLegado('modalidades', legadoId);

describe('mapearEscala: frentes', () => {
  it('frente de modalidade aponta a modalidade do redo-one (TC → CT); D.O (OT) e DO viram uma só; sem rótulo, cor, ordem nem ativo (vêm do catálogo)', () => {
    const { tabelas } = mapearEscala(escala(), contexto);

    const modalidades = tabelas.frentesEscala.map((f) => f.modalidadeId).sort();
    expect(modalidades).toEqual(
      [
        idModalidade('mo-CT'),
        idModalidade('mo-DO'),
        idModalidade('mo-MG'),
        idModalidade('mo-RX'),
      ].sort(),
    );
    const ct = tabelas.frentesEscala.find((f) => f.modalidadeId === idModalidade('mo-CT'));
    expect(ct).toEqual({
      id: idDoLegado('frentes_escala', `modalidade:${idModalidade('mo-CT')}`),
      tipo: 'modalidade',
      modalidadeId: idModalidade('mo-CT'),
      especialidadeId: null,
    });
  });

  it('frente de especialidade só para as que a escala usa; MAMO vai para MAMA e GERAL sai', () => {
    const { tabelas, avisos } = mapearEscala(
      escala({
        turnosEspecialidades: ['es-neuro', 'es-mamo', 'es-mama', 'es-geral', 'es-d.o', 'es-do'].map(
          (especialidadeId) => ({ turnoId: 't-manha', especialidadeId, ativo: true }),
        ),
      }),
      contexto,
    );

    const especialidades = tabelas.frentesEscala.filter((f) => f.tipo === 'especialidade');
    expect(especialidades.map((f) => f.especialidadeId).sort()).toEqual(
      [idEspecialidade('es-mama'), idEspecialidade('es-neuro')].sort(),
    );
    // Uma linha por turno × frente: MAMO e MAMA, D.O e DO caem na mesma.
    expect(tabelas.turnosFrentes).toHaveLength(3);
    expect(avisos).toContainEqual(
      expect.objectContaining({ tabela: 'frentes_escala', item: 'GERAL' }),
    );
  });

  it('id da frente é estável e vem do destino', () => {
    const a = mapearEscala(escala(), contexto).tabelas.frentesEscala;
    const b = mapearEscala(escala(), contexto).tabelas.frentesEscala;
    expect(a).toEqual(b);
    expect(a.find((f) => f.modalidadeId === idModalidade('mo-CT'))?.id).toBe(
      idDoLegado('frentes_escala', `modalidade:${idModalidade('mo-CT')}`),
    );
  });
});

const idAlocacao = (legadoId: string) => idDoLegado('alocacoes_medico', legadoId);
const frenteNeuro = () =>
  idDoLegado('frentes_escala', `especialidade:${idEspecialidade('es-neuro')}`);

describe('mapearEscala: alocações', () => {
  it('troca os nomes dos recortes pelos ids: prioridade pelo de-para, sem subespecialidade vira o geral', () => {
    const { tabelas, avisos, resumo } = mapearEscala(
      escala({
        alocacoes: [
          alocacao('a1', {
            prioridades: ['Rotina', 'Ambulatório', 'Internado', 'Emergência', 'Plantão'],
            subespecialidades: ['AVC', '(SEM SUBESPECIALIDADE)', 'Inexistente'],
          }),
        ],
      }),
      contexto,
    );

    expect(tabelas.alocacoes).toEqual([
      expect.objectContaining({
        id: idAlocacao('a1'),
        medicoId: idDoLegado('medicos', 'm1'),
        turnoId: idDoLegado('turnos', 't-manha'),
        frenteId: frenteNeuro(),
        diasSemana: [1, 2],
        dataFim: null,
        subespecialidadeGeral: true,
        coberturaDeId: null,
      }),
    ]);
    expect(tabelas.alocacoesPrioridades.map((p) => p.prioridadeId).sort()).toEqual(
      [idDoLegado('prioridades', 'pr-rot'), idDoLegado('prioridades', 'pr-urg')].sort(),
    );
    expect(tabelas.alocacoesSubespecialidades).toEqual([
      {
        alocacaoId: idAlocacao('a1'),
        subespecialidadeId: idDoLegado('subespecialidades', 'su-avc'),
      },
    ]);
    expect(resumo).toMatchObject({ prioridadesSemPar: 1, subespecialidadesSemPar: 1 });
    expect(avisos).toContainEqual(expect.objectContaining({ item: 'Plantão' }));
  });

  it('cobertura aponta o titular e não copia recortes', () => {
    const { tabelas, resumo } = mapearEscala(
      escala({
        alocacoes: [
          alocacao('a1', { prioridades: ['Rotina'] }),
          alocacao('c1', {
            medicoId: 'm2',
            coberturaDeId: 'a1',
            dataFim: '2026-02-01',
            prioridades: ['Rotina'],
            criadoEm: '2026-01-02T00:00:00.000Z',
          }),
        ],
      }),
      contexto,
    );

    expect(tabelas.alocacoes.find((a) => a.id === idAlocacao('c1'))?.coberturaDeId).toBe(
      idAlocacao('a1'),
    );
    expect(tabelas.alocacoesPrioridades.map((p) => p.alocacaoId)).toEqual([idAlocacao('a1')]);
    expect(resumo).toMatchObject({ coberturas: 1, coberturasComRecorteIgnorado: 1 });
  });

  it('corrige o ano digitado errado pelo ano do fim', () => {
    const { tabelas, resumo } = mapearEscala(
      escala({ alocacoes: [alocacao('a1', { dataInicio: '0206-10-30', dataFim: '2026-10-30' })] }),
      contexto,
    );

    expect(tabelas.alocacoes[0]).toMatchObject({ dataInicio: '2026-10-30', dataFim: '2026-10-30' });
    expect(resumo.alocacoesDataCorrigida).toBe(1);
  });

  it('duplicata exata: fica a mais antiga, e o ajuste e a cobertura dela vão para a que fica', () => {
    const { tabelas, resumo } = mapearEscala(
      escala({
        alocacoes: [
          alocacao('nova', { criadoEm: '2026-03-01T00:00:00.000Z' }),
          alocacao('velha', { criadoEm: '2026-02-01T00:00:00.000Z' }),
          alocacao('c1', {
            medicoId: 'm2',
            coberturaDeId: 'nova',
            dataFim: '2026-04-01',
            criadoEm: '2026-03-02T00:00:00.000Z',
          }),
        ],
        ajustes: [
          {
            id: 'aj1',
            alocacaoId: 'nova',
            data: '2026-03-10',
            produtividade: 5,
            observacoes: null,
          },
        ],
      }),
      contexto,
    );

    expect(tabelas.alocacoes.map((a) => a.id).sort()).toEqual(
      [idAlocacao('velha'), idAlocacao('c1')].sort(),
    );
    expect(tabelas.alocacoes.find((a) => a.id === idAlocacao('c1'))?.coberturaDeId).toBe(
      idAlocacao('velha'),
    );
    expect(tabelas.ajustesProdutividade).toEqual([
      {
        id: idDoLegado('ajustes_produtividade', 'velha:2026-03-10'),
        alocacaoId: idAlocacao('velha'),
        data: '2026-03-10',
        produtividade: 5,
        observacoes: null,
      },
    ]);
    expect(resumo.alocacoesDuplicadas).toBe(1);
  });

  it('médico inativo: a vigente acaba ontem, a que ainda não começou sai, a encerrada fica como está', () => {
    const { tabelas, resumo } = mapearEscala(
      escala({
        alocacoes: [
          alocacao('vigente', { medicoId: 'm3' }),
          alocacao('futura', { medicoId: 'm3', dataInicio: '2026-11-16', diasSemana: [3] }),
          alocacao('acabou', { medicoId: 'm3', dataFim: '2026-06-30', diasSemana: [4] }),
        ],
      }),
      contexto,
    );

    const porId = Object.fromEntries(tabelas.alocacoes.map((a) => [a.id, a]));
    expect(porId[idAlocacao('vigente')]?.dataFim).toBe('2026-11-15');
    expect(porId[idAlocacao('acabou')]?.dataFim).toBe('2026-06-30');
    expect(porId[idAlocacao('futura')]).toBeUndefined();
    expect(resumo).toMatchObject({
      alocacoesEncerradasMedicoInativo: 1,
      alocacoesDescartadasMedicoInativo: 1,
    });
  });

  it('alocação de frente que não existe (GERAL) fica de fora e é contada', () => {
    const { tabelas, resumo } = mapearEscala(
      escala({ alocacoes: [alocacao('a1', { especialidadeId: 'es-geral' })] }),
      contexto,
    );

    expect(tabelas.alocacoes).toEqual([]);
    expect(resumo.alocacoesDescartadas).toBe(1);
  });
});

type Ausencia = LegadoEscala['ausencias'][number];
const ausencia = (id: string, extra: Partial<Ausencia> = {}): Ausencia => ({
  id,
  medicoId: 'm1',
  tipo: 'ferias',
  dataInicio: '2026-07-01',
  dataFim: '2026-07-15',
  observacoes: 'cirurgia',
  especialidadeIds: [],
  diasSemana: [],
  turnoIds: [],
  situacao: 'aprovada',
  origem: 'gestor',
  solicitadaPorUserId: null,
  revisadaPorUserId: null,
  revisadaEm: null,
  motivoRecusa: null,
  criadoEm: '2026-06-01T12:00:00.000Z',
  ...extra,
});

describe('mapearEscala: ausências e escopo', () => {
  it('semeia os tipos de ausência com a gravidade decidida', () => {
    const { tabelas } = mapearEscala(escala(), contexto);

    expect(tabelas.tiposAusencia.map((t) => [t.nome, t.gravidade])).toEqual([
      ['Dispensado', 1],
      ['Folga', 2],
      ['Férias', 3],
      ['Licença', 4],
      ['Falta justificada', 5],
      ['Falta não justificada', 6],
    ]);
    expect(tabelas.tiposAusencia.find((t) => t.nome === 'Dispensado')?.soGestor).toBe(true);
    expect(
      tabelas.tiposAusencia.find((t) => t.nome === 'Falta não justificada')?.contaComoFalta,
    ).toBe(true);
  });

  it('recortes viram frentes e turnos; id órfão sai do recorte, não da ausência; usuário casa pelo e-mail', () => {
    const { tabelas, resumo } = mapearEscala(
      escala({
        ausencias: [
          ausencia('au1', {
            especialidadeIds: ['es-neuro', 'sumiu'],
            turnoIds: ['t-manha', 'sumiu'],
            solicitadaPorUserId: 'u-gestora',
            revisadaPorUserId: 'u-fantasma',
          }),
        ],
        usuarios: [
          {
            id: 'u-gestora',
            nome: 'Gestora',
            email: 'GESTORA@tele.com',
            escopoTurnoIds: [],
            escopoEspecialidadeIds: [],
          },
        ],
      }),
      contexto,
    );

    expect(tabelas.ausencias).toEqual([
      expect.objectContaining({
        id: idDoLegado('ausencias_medico', 'au1'),
        tipoId: idDoLegado('tipos_ausencia', 'ferias'),
        observacoes: 'cirurgia',
        solicitadaPorId: 'aaaaaaaa-0000-4000-8000-000000000001',
        revisadaPorId: null,
      }),
    ]);
    expect(tabelas.ausenciasFrentes).toEqual([
      { ausenciaId: idDoLegado('ausencias_medico', 'au1'), frenteId: frenteNeuro() },
    ]);
    expect(tabelas.ausenciasTurnos).toEqual([
      {
        ausenciaId: idDoLegado('ausencias_medico', 'au1'),
        turnoId: idDoLegado('turnos', 't-manha'),
      },
    ]);
    expect(resumo).toMatchObject({ ausenciasFrentesOrfas: 1, ausenciasTurnosOrfaos: 1 });
  });

  it('escopo só da usuária que existe no redo-one; a que não existe é contada pelo nome', () => {
    const { tabelas, avisos, resumo } = mapearEscala(
      escala({
        usuarios: [
          {
            id: 'u-gestora',
            nome: 'Gestora',
            email: 'gestora@tele.com',
            escopoTurnoIds: ['t-manha'],
            escopoEspecialidadeIds: ['es-neuro'],
          },
          {
            id: 'u-outra',
            nome: 'Outra',
            email: 'outra@tele.com',
            escopoTurnoIds: ['t-manha'],
            escopoEspecialidadeIds: [],
          },
        ],
      }),
      contexto,
    );

    expect(tabelas.usuariosEscoposEscala.map((e) => [e.turnoId, e.frenteId])).toEqual([
      [idDoLegado('turnos', 't-manha'), null],
      [null, frenteNeuro()],
    ]);
    expect(resumo.escoposSemUsuario).toBe(1);
    expect(avisos).toContainEqual(
      expect.objectContaining({ tabela: 'usuarios_escopos_escala', item: 'Outra' }),
    );
  });

  it('recorte da usuária que existe com todos os ids órfãos falha a carga (sem linhas ela veria tudo)', () => {
    const usuarios = [
      {
        id: 'u-gestora',
        nome: 'Gestora',
        email: 'gestora@tele.com',
        escopoTurnoIds: ['sumiu'],
        escopoEspecialidadeIds: ['es-geral'],
      },
    ];

    expect(() => mapearEscala(escala({ usuarios }), contexto)).toThrow(/Gestora/);
    expect(() => mapearEscala(escala({ usuarios }), contexto)).not.toThrow(/gestora@tele\.com/);
  });

  it('recorte todo órfão de usuária que não existe no redo-one só é contado', () => {
    const { tabelas, resumo } = mapearEscala(
      escala({
        usuarios: [
          {
            id: 'u-outra',
            nome: 'Outra',
            email: 'outra@tele.com',
            escopoTurnoIds: ['sumiu'],
            escopoEspecialidadeIds: [],
          },
        ],
      }),
      contexto,
    );

    expect(tabelas.usuariosEscoposEscala).toEqual([]);
    expect(resumo.escoposSemUsuario).toBe(1);
  });

  it('recorte parcialmente órfão fica com o que casa', () => {
    const { tabelas, resumo } = mapearEscala(
      escala({
        usuarios: [
          {
            id: 'u-gestora',
            nome: 'Gestora',
            email: 'gestora@tele.com',
            escopoTurnoIds: ['t-manha', 'sumiu'],
            escopoEspecialidadeIds: [],
          },
        ],
      }),
      contexto,
    );

    expect(tabelas.usuariosEscoposEscala.map((e) => e.turnoId)).toEqual([
      idDoLegado('turnos', 't-manha'),
    ]);
    expect(resumo.escoposOrfaos).toBe(1);
  });

  it.each([
    ['frentes', { especialidadeIds: ['sumiu', 'es-geral'] }],
    ['turnos', { turnoIds: ['sumiu'] }],
  ])('ausência com o recorte de %s inteiro órfão é descartada, não ampliada', (_, recorte) => {
    const { tabelas, avisos, resumo } = mapearEscala(
      escala({
        turnosEspecialidades: neuroNaManha,
        ausencias: [
          ausencia('au1', { especialidadeIds: ['es-neuro'], turnoIds: ['t-manha'], ...recorte }),
        ],
      }),
      contexto,
    );

    expect(tabelas.ausencias).toEqual([]);
    expect(tabelas.ausenciasFrentes).toEqual([]);
    expect(tabelas.ausenciasTurnos).toEqual([]);
    expect(resumo.ausenciasDescartadasRecorteOrfao).toBe(1);
    expect(avisos).toContainEqual(expect.objectContaining({ tabela: 'ausencias' }));
  });
});

type Log = LegadoEscala['logs'][number];
const log = (id: string, extra: Partial<Log> = {}): Log => ({
  id,
  entidade: 'alocacao_medico',
  registroId: 'a1',
  acao: 'criar',
  usuarioId: null,
  usuarioNome: 'Fulana',
  medicoId: 'm1',
  antes: null,
  depois: { medico: 'Dra. Ana', turno: 'Manhã', especialidade: 'NEURO' },
  criadoEm: '2026-10-02T13:00:00.000Z',
  ...extra,
});

/** A frente NEURO só nasce se a escala a usar. */
const neuroNaManha = [{ turnoId: 't-manha', especialidadeId: 'es-neuro', ativo: true }];

describe('mapearEscala: histórico', () => {
  it('log vira evento com id estável, particípio e o contexto do redo-one no depois', () => {
    const { tabelas } = mapearEscala(
      escala({ turnosEspecialidades: neuroNaManha, logs: [log('l1')] }),
      contexto,
    );

    expect(tabelas.eventosAuditoria).toEqual([
      {
        id: idDoLegado('eventos_escala', 'l1'),
        ocorridoEm: new Date('2026-10-02T13:00:00.000Z'),
        atorTipo: 'sistema',
        atorId: null,
        entidade: 'alocacao',
        entidadeId: idAlocacao('a1'),
        acao: 'criado',
        antes: null,
        depois: {
          medico: 'Dra. Ana',
          turno: 'Manhã',
          especialidade: 'NEURO',
          medicoId: idDoLegado('medicos', 'm1'),
          turnoId: idDoLegado('turnos', 't-manha'),
          frenteId: frenteNeuro(),
          usuarioLegado: 'Fulana',
        },
      },
    ]);
  });

  it('remoção leva o contexto no antes; autor que casa vira ator usuário', () => {
    const { tabelas } = mapearEscala(
      escala({
        turnosEspecialidades: neuroNaManha,
        logs: [
          log('l1', {
            acao: 'remover',
            usuarioId: 'u-gestora',
            antes: { turno: 'Manhã', especialidade: 'NEURO' },
            depois: null,
          }),
        ],
        usuarios: [
          {
            id: 'u-gestora',
            nome: 'Gestora',
            email: 'gestora@tele.com',
            escopoTurnoIds: [],
            escopoEspecialidadeIds: [],
          },
        ],
      }),
      contexto,
    );

    expect(tabelas.eventosAuditoria[0]).toMatchObject({
      atorTipo: 'usuario',
      atorId: 'aaaaaaaa-0000-4000-8000-000000000001',
      acao: 'excluido',
      depois: null,
      antes: { turnoId: idDoLegado('turnos', 't-manha'), frenteId: frenteNeuro() },
    });
  });

  it('especialidades do turno viram evento do turno; ajuste aponta o ajuste pelo dia; ausência leva turnos e frentes', () => {
    const { tabelas } = mapearEscala(
      escala({
        turnosEspecialidades: neuroNaManha,
        logs: [
          log('l1', {
            entidade: 'turno_especialidade',
            registroId: 't-manha',
            acao: 'atualizar',
            medicoId: null,
            depois: { especialidades: [] },
          }),
          log('l2', {
            entidade: 'ajuste_produtividade',
            depois: {
              turno: 'Manhã',
              especialidade: 'NEURO',
              data: '2026-10-05',
              produtividade: 3,
            },
          }),
          log('l3', {
            entidade: 'ausencia_medico',
            registroId: 'au1',
            depois: {
              tipo: 'ferias',
              turnoIds: ['t-manha'],
              especialidadeIds: ['es-neuro', 'sumiu'],
            },
          }),
        ],
      }),
      contexto,
    );

    const [turnoEv, ajusteEv, ausenciaEv] = tabelas.eventosAuditoria;
    expect(turnoEv).toMatchObject({
      entidade: 'turno',
      entidadeId: idDoLegado('turnos', 't-manha'),
      acao: 'alterado',
    });
    expect(ajusteEv).toMatchObject({
      entidade: 'ajuste_produtividade',
      entidadeId: idDoLegado('ajustes_produtividade', 'a1:2026-10-05'),
    });
    expect(ausenciaEv).toMatchObject({
      entidade: 'ausencia',
      entidadeId: idDoLegado('ausencias_medico', 'au1'),
      depois: {
        medicoId: idDoLegado('medicos', 'm1'),
        turnoIds: [idDoLegado('turnos', 't-manha')],
        frenteIds: [frenteNeuro()],
      },
    });
  });

  it('LGPD: observações e motivo da recusa da ausência não vão para o evento, só a marca de que mudaram', () => {
    const foto = (extra: Record<string, unknown>) => ({
      medico: 'Dra. Ana',
      tipo: 'ferias',
      turnoIds: [],
      especialidadeIds: [],
      situacao: 'pendente',
      observacoes: null,
      motivoRecusa: null,
      ...extra,
    });
    const doAusencia = { entidade: 'ausencia_medico', registroId: 'au1' };
    const { tabelas } = mapearEscala(
      escala({
        logs: [
          log('criada', { ...doAusencia, depois: foto({ observacoes: 'cirurgia cardíaca' }) }),
          log('recusada', {
            ...doAusencia,
            acao: 'recusar',
            antes: foto({ observacoes: 'cirurgia cardíaca' }),
            depois: foto({
              observacoes: 'cirurgia cardíaca',
              situacao: 'recusada',
              motivoRecusa: 'sem atestado do oncologista',
            }),
          }),
          log('alterada', {
            ...doAusencia,
            acao: 'atualizar',
            antes: foto({ observacoes: 'cirurgia cardíaca', motivoRecusa: 'sem atestado' }),
            depois: foto({ observacoes: 'quimioterapia', motivoRecusa: 'sem atestado' }),
          }),
          log('removida', {
            ...doAusencia,
            acao: 'remover',
            antes: foto({ observacoes: 'cirurgia cardíaca', motivoRecusa: 'sem atestado' }),
            depois: null,
          }),
          log('sem-texto', { ...doAusencia, depois: foto({}) }),
        ],
      }),
      contexto,
    );

    const tudo = JSON.stringify(tabelas.eventosAuditoria);
    for (const vazado of ['cirurgia', 'quimioterapia', 'atestado', 'observacoes"', 'motivoRecusa"'])
      expect(tudo).not.toContain(vazado);
    const [criada, recusada, alterada, removida, semTexto] = tabelas.eventosAuditoria;
    expect(criada?.depois).toMatchObject({ observacoesAlteradas: true });
    expect(recusada?.depois).toMatchObject({ situacao: 'recusada', motivoRecusaAlterado: true });
    expect(recusada?.depois).not.toHaveProperty('observacoesAlteradas');
    expect(alterada?.depois).toMatchObject({ observacoesAlteradas: true });
    expect(alterada?.depois).not.toHaveProperty('motivoRecusaAlterado');
    expect(removida?.antes).toMatchObject({ medico: 'Dra. Ana', tipo: 'ferias' });
    expect(semTexto?.depois).not.toHaveProperty('observacoesAlteradas');
    expect(semTexto?.depois).not.toHaveProperty('motivoRecusaAlterado');
  });
});
