import { describe, expect, it } from 'vitest';

import { medicoEmTurno } from '../components/rodada/teste-dados';
import type { MedicoEmTurnoDto } from '../gen/types/MedicoEmTurnoDto';

import {
  buscaDoPeriodoHistorico,
  cargaDoMedico,
  cargaNaUnidade,
  consultaDoPeriodo,
  descreverRecortes,
  etapasDaRodada,
  filtrarMedicosEmTurno,
  funilDosExames,
  funilDosMedicos,
  intervaloDaRodada,
  intervaloDoRetrato,
  juntarNomes,
  medicosEmTurno,
  opcoesDosFiltros,
  periodoDoHistorico,
  recolhimentoPrevistoEmTexto,
  resumoDoRecolhimento,
  rotuloMotivo,
  rotuloRecolhido,
  situacaoDaRodada,
  textoDaCarga,
  tituloDaRodada,
} from './rodada';

const agora = new Date('2026-11-18T14:00:00Z'); // 11:00 em Brasília
const CABECA = { id: 'cab', nome: 'Cabeça e pescoço', cor: '#3E8E5E' };
const AVC = { id: 'avc', nome: 'AVC', cor: null };
const oc = (p: Partial<MedicoEmTurnoDto>): MedicoEmTurnoDto =>
  medicoEmTurno('m1', 'Helena', 18, 60, {
    alocacaoId: 'a',
    turnoId: 't',
    frenteId: 'f-mi',
    frenteNome: 'MEDICINA INTERNA',
    ...p,
  });

describe('rodada do robô na tela', () => {
  it('situação com rótulo e tom; consulta a cada 4 s só nas etapas que andam sozinhas', () => {
    expect(situacaoDaRodada('aguardando_aprovacao')).toEqual({
      texto: 'Aguardando aprovação',
      tom: 'atencao',
    });
    expect(situacaoDaRodada('falhou').tom).toBe('erro');
    for (const s of ['solicitada', 'lendo', 'aprovada', 'executando'] as const) {
      expect(intervaloDaRodada(s)).toBe(4000);
    }
    for (const s of ['aguardando_aprovacao', 'pausada', 'parcial', 'concluida'] as const) {
      expect(intervaloDaRodada(s)).toBe(false);
    }
    expect(intervaloDaRodada(undefined)).toBe(false);
  });

  it('todo motivo tem rótulo legível, inclusive os que a execução e o controle gravam', () => {
    for (const m of [
      'fora_da_frente',
      'fora_da_subespecialidade',
      'teto_da_rodada',
      'removido_na_conferencia',
      'encerrada_pelo_operador',
      'rodada_cancelada',
      'sem_conta_mobilemed',
      'erro_inesperado',
      'saiu_da_fila',
      'sessao_caiu',
      'ja_atribuido_mobilemed',
      'sem_espaco',
      'retirado_do_medico',
    ]) {
      expect(rotuloMotivo(m)).not.toMatch(/_/);
    }
    expect(rotuloMotivo('removido_na_conferencia')).toBe('Tirado na conferência');
    expect(rotuloMotivo('cliente_inativo')).toBe('Cliente inativo no cadastro');
    expect(rotuloMotivo('medico_fora_da_unidade')).toBe(
      'Conta do médico não liberada nesta unidade na MobileMed',
    );
    expect(rotuloMotivo('codigo_novo')).toBe('Codigo novo');
    expect(rotuloMotivo(null)).toBe('Sem motivo');
  });

  it('título pelo dia em que foi pedida', () => {
    expect(tituloDaRodada('2026-11-18T13:31:00Z', agora)).toBe('Rodada de hoje, 10:31');
    expect(tituloDaRodada('2026-11-17T13:31:00Z', agora)).toBe('Rodada de ontem, 10:31');
    expect(tituloDaRodada('2026-11-10T13:31:00Z', agora)).toBe('Rodada de 10/11, 10:31');
  });

  it('nomes juntos com "e"', () => {
    expect(juntarNomes([])).toBe('');
    expect(juntarNomes(['Manhã'])).toBe('Manhã');
    expect(juntarNomes(['Manhã', 'Lista', 'Tarde'])).toBe('Manhã, Lista e Tarde');
  });

  it('etapas: o que já foi, a de agora e as que faltam', () => {
    const base = {
      status: 'aguardando_aprovacao' as const,
      lidaEm: '2026-11-18T13:32:00Z',
      aprovadaEm: null,
      contagens: { prevista: 10, executada: 0, pulada: 0, falhou: 0, recusada: 3, retentaveis: 0 },
    };
    expect(etapasDaRodada(base)).toEqual([
      { rotulo: 'Pedida', estado: 'feito' },
      { rotulo: 'Fila lida às 10:32', estado: 'feito' },
      { rotulo: 'Aguardando aprovação', estado: 'agora' },
      { rotulo: 'Executando', estado: 'futuro' },
      { rotulo: 'Concluída', estado: 'futuro' },
    ]);
    const parcial = etapasDaRodada({
      ...base,
      status: 'parcial',
      aprovadaEm: '2026-11-18T13:41:00Z',
      contagens: { ...base.contagens, prevista: 0, executada: 8, falhou: 2, retentaveis: 2 },
    });
    expect(parcial.at(-1)).toEqual({ rotulo: 'Parcial: 2 por tentar de novo', estado: 'agora' });
    expect(parcial[2]).toEqual({ rotulo: 'Aprovada às 10:41', estado: 'feito' });
    expect(etapasDaRodada({ ...base, status: 'expirada' })[2]).toEqual({
      rotulo: 'Expirou sem aprovação',
      estado: 'agora',
    });
  });

  it('recortes em texto: vazio = todos; médicos tirados e incluídos pelo nome', () => {
    const recortes = {
      todosTurnos: false,
      turnoIds: ['t1', 't2'],
      todasFrentes: true,
      frenteIds: [],
      todasPrioridades: false,
      prioridadeOperacaoIds: ['p1'],
      todosSegmentos: false,
      subespecialidadeIds: ['s1'],
      subespecialidadeGeral: true,
      todosClientes: false,
      clienteIds: ['c1', 'c2', 'c3'],
      medicosExcluidos: ['m1'],
      medicosIncluidos: [],
    };
    const nomes = new Map([
      ['t1', 'Manhã'],
      ['t2', 'Lista'],
      ['p1', 'Urgência'],
      ['s1', 'CRÂNIO'],
      ['m1', 'Gustavo Vilela'],
    ]);
    expect(descreverRecortes(recortes, nomes)).toEqual([
      { rotulo: 'Turnos', valor: 'Manhã e Lista' },
      { rotulo: 'Frentes', valor: 'Todas' },
      { rotulo: 'Prioridades', valor: 'Urgência' },
      { rotulo: 'Subespecialidades', valor: 'CRÂNIO e Sem subespecialidade' },
      { rotulo: 'Clientes', valor: '3 clientes' },
      { rotulo: 'Médicos', valor: 'Sem Gustavo Vilela' },
    ]);
    // Sem o "todos" e com a lista vazia, o eixo não distribui nada.
    expect(descreverRecortes({ ...recortes, todasFrentes: false }, nomes)[1]).toEqual({
      rotulo: 'Frentes',
      valor: 'Nenhuma',
    });
  });

  it('funil dos médicos: dos habilitados aos que receberam, com o portão da conta na MobileMed', () => {
    const funil = funilDosMedicos({
      habilitados: 281,
      escalados: 40,
      disponiveis: 38,
      noTurno: 30,
      noHorario: 20,
      comConta: 2,
      tirados: 0,
      receberam: 2,
    });
    expect(funil.map((l) => [l.rotulo, l.saem, l.restam])).toEqual([
      ['Habilitados no robô', 0, 281],
      ['Sem escala agora', 241, 40],
      ['Com ausência no dia', 2, 38],
      ['Fora dos turnos e frentes da rodada (ou tirados)', 8, 30],
      ['Fora do horário agora', 10, 20],
      ['Sem conta na MobileMed', 18, 2],
      ['Receberam exames', 0, 2],
    ]);
  });

  it('funil dos exames: dos lidos aos atribuídos, etapa por etapa', () => {
    const funil = funilDosExames(100, [
      { status: 'recusada', motivo: 'sem_espaco', quantidade: 12 },
      { status: 'recusada', motivo: 'nao_novo', quantidade: 3 },
      { status: 'pulada', motivo: 'removido_na_conferencia', quantidade: 2 },
      { status: 'pulada', motivo: 'saiu_da_fila', quantidade: 4 },
      { status: 'falhou', motivo: 'sessao_caiu', quantidade: 1 },
    ]);
    expect(funil.map((f) => [f.rotulo, f.saem, f.restam])).toEqual([
      ['Lidos na fila', 0, 100],
      ['Todos que laudam estavam no teto', 12, 88],
      ['Já aberto por um médico', 3, 85],
      ['Propostos', 0, 85],
      ['Tirado na conferência', 2, 83],
      ['Já tinha médico quando o robô chegou', 4, 79],
      ['A sessão da MobileMed caiu', 1, 78],
      ['Atribuídos ou por atribuir', 0, 78],
    ]);
    expect(funil[1]).toMatchObject({ marco: false, filtro: { motivo: 'sem_espaco' } });
  });

  it('médicos em turno: um por médico, com os turnos e frentes juntos e o maior teto', () => {
    expect(
      medicosEmTurno([
        oc({}),
        oc({ frenteId: 'f-ct', frenteNome: 'CT', frenteCor: null, produtividade: 90 }),
        oc({ medicoId: 'm2', nome: 'Ana', turnoId: 't2', turno: 'Lista', produtividade: null }),
      ]),
    ).toEqual([
      expect.objectContaining({
        medicoId: 'm2',
        nome: 'Ana',
        turnos: [{ id: 't2', nome: 'Lista', cor: '#2F6FB2' }],
        frentes: [{ id: 'f-mi', nome: 'MEDICINA INTERNA', cor: '#7A5AB5', recorte: [] }],
        cargaEmMaos: 18,
        teto: null,
      }),
      expect.objectContaining({
        medicoId: 'm1',
        turnos: [{ id: 't', nome: 'Manhã', cor: '#2F6FB2' }],
        frentes: [
          { id: 'f-mi', nome: 'MEDICINA INTERNA', cor: '#7A5AB5', recorte: [] },
          { id: 'f-ct', nome: 'CT', cor: null, recorte: [] },
        ],
        teto: 90,
      }),
    ]);
  });

  it('médicos em turno: o recorte de segmento aparece na frente; sem recorte em outro período, some', () => {
    const [helena] = medicosEmTurno([oc({ segmentosRecortados: true, segmentos: [CABECA] })]);
    expect(helena?.frentes[0]?.recorte).toEqual([CABECA]);
    const [junto] = medicosEmTurno([
      oc({ segmentosRecortados: true, segmentos: [CABECA] }),
      oc({ alocacaoId: 'b', segmentos: [CABECA, AVC] }),
    ]);
    expect(junto?.frentes[0]?.recorte).toEqual([]);
  });

  it('filtros dos médicos em turno: opções dos dados; turno e frente por qualquer um; segmento pelo que a frente cobre', () => {
    const medicos = medicosEmTurno([
      oc({ segmentos: [CABECA, AVC] }),
      oc({
        medicoId: 'm2',
        nome: 'Ana',
        turnoId: 't2',
        turno: 'Tarde',
        segmentosRecortados: true,
        segmentos: [AVC],
      }),
      oc({
        medicoId: 'm3',
        nome: 'Caio',
        frenteId: 'f-ct',
        frenteNome: 'CT',
        frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'ct' },
      }),
    ]);
    const opcoes = opcoesDosFiltros(medicos);
    expect(opcoes.turnos.map((o) => o.rotulo)).toEqual(['Manhã', 'Tarde']);
    expect(opcoes.frentes.map((o) => o.rotulo)).toEqual(['CT', 'MEDICINA INTERNA']);
    expect(opcoes.segmentos).toEqual([
      { valor: 'avc', rotulo: 'AVC', cor: null },
      { valor: 'cab', rotulo: 'Cabeça e pescoço', cor: '#3E8E5E' },
    ]);
    const nomes = (f: Parameters<typeof filtrarMedicosEmTurno>[1]) =>
      filtrarMedicosEmTurno(medicos, f).map((m) => m.nome);
    expect(nomes({ turnos: ['t2'], frentes: [], segmentos: [] })).toEqual(['Ana']);
    expect(nomes({ turnos: [], frentes: ['f-ct', 'f-mi'], segmentos: [] })).toHaveLength(3);
    expect(nomes({ turnos: [], frentes: [], segmentos: ['cab'] })).toEqual(['Helena']);
    expect(nomes({ turnos: [], frentes: [], segmentos: ['avc'] })).toEqual(['Ana', 'Helena']);
    expect(nomes({ turnos: ['t'], frentes: [], segmentos: ['avc'] })).toEqual(['Helena']);
  });

  it('carga do médico depois da rodada, contra o teto', () => {
    expect(cargaDoMedico({ cargaEmMaos: 18, propostos: 64, capacidade: 90 })).toEqual({
      depois: 82,
      teto: 90,
      noTeto: false,
      pctAberto: 20,
      pctProposto: 71,
    });
    expect(cargaDoMedico({ cargaEmMaos: 50, propostos: 20, capacidade: 60 })).toMatchObject({
      noTeto: true,
      pctProposto: 17,
    });
    expect(cargaDoMedico({ cargaEmMaos: 5, propostos: 1, capacidade: null })).toMatchObject({
      teto: null,
      noTeto: false,
    });
  });
});

describe('unidade do teto do médico', () => {
  it('a carga prevista sai em exames ou em laudos, conforme o médico', () => {
    const m = { previstas: 2, laudosPrevistos: 5 };
    expect(cargaNaUnidade({ ...m, unidadeTeto: 'exames' })).toBe(2);
    expect(cargaNaUnidade({ ...m, unidadeTeto: 'laudos' })).toBe(5);
    // Fora do retrato (mandado na conferência): conta em exames.
    expect(cargaNaUnidade({ ...m, unidadeTeto: null })).toBe(2);
  });

  it('o texto da carga diz a unidade junto do teto', () => {
    expect(textoDaCarga({ depois: 12, teto: 20 }, 'exames')).toBe('12 de 20 exames');
    expect(textoDaCarga({ depois: 12, teto: 20 }, 'laudos')).toBe('12 de 20 laudos');
    expect(textoDaCarga({ depois: 3, teto: null }, 'laudos')).toBe('3 laudos, sem teto');
    // Retrato antigo, sem a unidade: só os números.
    expect(textoDaCarga({ depois: 12, teto: 20 }, undefined)).toBe('12 de 20');
  });
});

describe('recolhimento na tela', () => {
  it('o funil soma os recolhidos que entraram na proposta aos lidos', () => {
    const funil = funilDosExames(
      10,
      [{ status: 'pulada', motivo: 'removido_na_conferencia', quantidade: 1 }],
      3,
    );
    expect(funil.map((f) => [f.rotulo, f.saem, f.restam, f.marco])).toEqual([
      ['Lidos na fila', 0, 10, true],
      ['Mais os recolhidos de outros médicos', 0, 13, true],
      ['Propostos', 0, 13, true],
      ['Tirado na conferência', 1, 12, false],
      ['Atribuídos ou por atribuir', 0, 12, true],
    ]);
  });

  it('diz de quem o exame foi recolhido e por quê', () => {
    expect(rotuloRecolhido({ recolhidoDe: null, motivoRecolhimento: null })).toBeNull();
    expect(
      rotuloRecolhido({
        recolhidoDe: { id: 'a', nome: 'Dra. Ana' },
        motivoRecolhimento: 'turno_encerrado',
      }),
    ).toEqual({ etiqueta: 'Recolhido de Dra. Ana', motivo: 'Turno encerrado' });
    expect(
      rotuloRecolhido({
        recolhidoDe: { id: 'a', nome: 'Dra. Ana' },
        motivoRecolhimento: 'ausencia',
      }),
    ).toEqual({ etiqueta: 'Recolhido de Dra. Ana', motivo: 'Ausente hoje' });
  });

  it('o resumo da leitura em frases legíveis, só com os motivos que contam', () => {
    expect(resumoDoRecolhimento(null)).toBeNull();
    const r = resumoDoRecolhimento({
      recolhiveis: 5,
      porAusencia: 2,
      propostos: 4,
      semDestino: 1,
      naoRecolhidos: {
        aberto: 3,
        trocado_por_fora: 0,
        pacote_aberto: 1,
        turno_em_curso: 6,
        frente_nao_recolhe: 2,
      },
    });
    expect(r).toEqual({
      texto:
        '5 recolhido(s) de médicos fora do turno ou ausentes (2 por ausência): 4 propostos a outro médico, 1 fica(m) com quem tem',
      ficaram: [
        { rotulo: 'Turno da entrega ainda em curso (ou na carência)', quantidade: 6 },
        { rotulo: 'Já aberto pelo médico', quantidade: 3 },
        { rotulo: 'Frente que não recolhe ao fim do turno', quantidade: 2 },
        { rotulo: 'Outro exame do pacote já aberto', quantidade: 1 },
      ],
    });
    expect(
      resumoDoRecolhimento({
        recolhiveis: 0,
        porAusencia: 0,
        propostos: 0,
        semDestino: 0,
        naoRecolhidos: {
          aberto: 0,
          trocado_por_fora: 0,
          pacote_aberto: 0,
          turno_em_curso: 0,
          frente_nao_recolhe: 0,
        },
      })?.texto,
    ).toBe('Nenhum exame a recolher');
  });

  it('a prévia do "Distribuir agora"', () => {
    expect(recolhimentoPrevistoEmTexto(undefined)).toBeNull();
    expect(recolhimentoPrevistoEmTexto({ ligado: false, recolhiveis: 0, porAusencia: 0 })).toBe(
      'Recolhimento desligado em Configurações › Distribuição.',
    );
    expect(recolhimentoPrevistoEmTexto({ ligado: true, recolhiveis: 0, porAusencia: 0 })).toBe(
      'Nenhum exame a recolher de médicos fora do turno ou ausentes.',
    );
    expect(recolhimentoPrevistoEmTexto({ ligado: true, recolhiveis: 7, porAusencia: 2 })).toBe(
      'Mais 7 exame(s) a recolher de médicos fora do turno ou ausentes (2 por ausência), se houver quem os pegue.',
    );
  });

  it('motivo da execução do recolhido que mudou de mão', () => {
    expect(rotuloMotivo('mudou_de_dono')).toBe('Aberto ou trocado de médico desde o recolhimento');
  });
});

describe('intervaloDoRetrato', () => {
  const lida = '2026-11-23T12:00:00Z';
  const t = (iso: string) => new Date(iso).getTime();
  const base = {
    rodadaViva: false,
    lendo: false,
    intervaloMin: 5,
    lidaEm: lida,
    falhaEm: null,
    pedidaEm: null,
  };

  it('com rodada viva, não consulta; com leitura pedida, de 3 em 3 s', () => {
    expect(intervaloDoRetrato({ ...base, rodadaViva: true }, t(lida))).toBe(false);
    expect(intervaloDoRetrato({ ...base, lendo: true }, t(lida))).toBe(3000);
  });

  it('espera a próxima leitura do job (a última mais o intervalo, com folga)', () => {
    expect(intervaloDoRetrato(base, t('2026-11-23T12:00:10Z'))).toBe(5 * 60_000 + 30_000 - 10_000);
    // A falha e o pedido também contam como a última leitura (o job conta igual).
    expect(
      intervaloDoRetrato({ ...base, falhaEm: '2026-11-23T12:02:00Z' }, t('2026-11-23T12:02:00Z')),
    ).toBe(5 * 60_000 + 30_000);
  });

  it('a leitura atrasou: tenta de minuto em minuto', () => {
    expect(intervaloDoRetrato(base, t('2026-11-23T12:06:00Z'))).toBe(60_000);
    expect(intervaloDoRetrato({ ...base, lidaEm: null }, t(lida))).toBe(60_000);
  });

  it('leitura automática desligada: a cada 5 min (só a leitura pedida muda a fila)', () => {
    expect(intervaloDoRetrato({ ...base, intervaloMin: null }, t(lida))).toBe(5 * 60_000);
  });
});

describe('período do histórico das rodadas', () => {
  const hoje = '2026-11-16';

  it('sem nada na URL, os últimos 7 dias; "todas" é sem período', () => {
    expect(periodoDoHistorico({}, hoje)).toEqual({ de: '2026-11-09', ate: hoje });
    expect(periodoDoHistorico({ periodo: 'todas' }, hoje)).toEqual({
      de: undefined,
      ate: undefined,
    });
    expect(periodoDoHistorico({ de: '2026-10-01', ate: '2026-10-31' }, hoje)).toEqual({
      de: '2026-10-01',
      ate: '2026-10-31',
    });
  });

  it('de volta para a URL: o padrão some, sem período vira "todas"', () => {
    expect(buscaDoPeriodoHistorico({ de: '2026-11-09', ate: hoje }, hoje)).toEqual({});
    expect(buscaDoPeriodoHistorico({ de: undefined, ate: undefined }, hoje)).toEqual({
      periodo: 'todas',
    });
    expect(buscaDoPeriodoHistorico({ de: '2026-10-01', ate: '2026-10-31' }, hoje)).toEqual({
      de: '2026-10-01',
      ate: '2026-10-31',
    });
  });

  it('para a API, o começo do primeiro dia e o começo do dia seguinte ao último, em Brasília', () => {
    expect(consultaDoPeriodo({ de: '2026-10-01', ate: '2026-10-31' })).toEqual({
      desde: '2026-10-01T03:00:00.000Z',
      ate: '2026-11-01T03:00:00.000Z',
    });
    expect(consultaDoPeriodo({ de: undefined, ate: undefined })).toEqual({});
  });
});
