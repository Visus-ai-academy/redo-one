import type { FrenteEscala } from '../arranjo';

/**
 * Configuração do motor de distribuição: a global (Configurações › Distribuição) e as regras de
 * cada frente (aba Distribuição no painel da especialidade ou modalidade). Tudo o que o negócio
 * muda entra por aqui; o motor só implementa o mecanismo. No dashboards-one boa parte disto era
 * constante no código (RX, MAMA, CARDIO, "TARDE", 10:50, COLUNAS de MSK, frentes do neurologista).
 */

/** "HH:MM" no relógio de Brasília. */
export type Horario = string;

export type CriterioFila = 'prioridade' | 'prazo' | 'antiguidade';

export interface ItemOrdemFila {
  criterio: CriterioFila;
  direcao: 'asc' | 'desc';
}

/** Papel dos turnos na regra da Lista (no dashboards-one, o turno de nome "TARDE" e as 10:50). */
export interface TurnosPosteriores {
  /** Turnos que só recebem numa rodada posterior do dia; a Lista guarda o que eles vão pegar. */
  turnoIds: string[];
  /** Hora da rodada que enche esses turnos: a partir dela, a Lista não guarda mais nada. */
  cheiaEm: Horario;
}

export interface ConfiguracaoDistribuicao {
  /** Critérios da fila, na ordem em que desempatam. */
  ordemFila: ItemOrdemFila[];
  /**
   * Prioridades do CATÁLOGO que contam como urgentes (hoje só URGÊNCIA), comparadas com a
   * prioridade do exame já traduzida pelas variações (Internado → ROTINA, Emergência → URGÊNCIA).
   * Vale para a urgência na fila, a margem de urgência e o rodízio. Decisão de 17/11/2026: o
   * dashboards-one tratava INTERNADO como urgente; aqui o internado passa na frente pelo prazo.
   */
  prioridadeIdsUrgentes: string[];
  /** Exames do mesmo paciente e da mesma especialidade andam juntos (pacote indivisível). */
  agruparPorPaciente: boolean;
  /** Distância máxima entre as entradas para juntar no pacote; 0 = sem limite. */
  janelaPacienteHoras: number;
  /** Folga aceita acima do teto do médico ("pode dar 1 ou 2 a mais"), em carga. */
  toleranciaAcimaTeto: number;
  /** Margem (%) acima do teto só para urgência; a rotina vai até o teto. */
  margemUrgenciaPct: number;
  /** Pontos percentuais que o atrasado pode passar da proporção por modalidade (100 = ignora). */
  folgaAtrasadoPct: number;
  /** A menos disto do prazo (ou atrasado), a prioridade do cliente sobe na fila. */
  prazoCriticoMin: number;
  /** Com quanta antecedência um turno que ainda não começou entra na rodada. */
  antecedenciaPeriodoMin: number;
  /** Intervalo entre rodadas: o que vence antes da próxima não espera a mistura. */
  cicloMinutos: number;
  /** Marcadores no nome do exame distribuídos por igual entre os elegíveis (ex.: ONCO). */
  marcadoresEquilibrio: string[];
  /** A frente da escala limita o que o médico recebe naquele período (além do arranjo). */
  escalaRestringeEspecialidade: boolean;
  /** Exame entregue a um médico nos últimos N dias e de volta à fila não volta para ele. */
  diasJaEntregue: number;
  /** Null = nenhum turno com papel de "posterior": a Lista não guarda nada. */
  turnosPosteriores: TurnosPosteriores | null;
}

/** Faixa em que a frente não é distribuída pelo robô; pode cruzar a meia-noite. */
export interface HorarioSemRobo {
  /** 0 = domingo … 6 = sábado; vazio = todos os dias. */
  diasSemana: number[];
  inicio: Horario;
  fim: Horario;
}

export type DivisaoFrente =
  | { metodo: 'igualitaria' }
  /** Mistura em EXAMES entre as modalidades listadas (ex.: MI 60 MR / 40 CT). */
  | { metodo: 'proporcao'; proporcoes: { modalidadeId: string; percentual: number }[] };

export interface RegraSegmento {
  subespecialidadeId: string;
  /** Máximo de EXAMES do segmento por médico a cada rodada (rígido); null = sem teto. */
  teto: number | null;
  /** Teto menor para quem tem produtividade de escala até `produtividadeAte`. */
  tetoReduzido: { produtividadeAte: number; teto: number } | null;
  /** Quantos do segmento cada médico que o lauda recebe logo depois das urgências. */
  piso: number | null;
  /** No pacote do paciente o segmento não se junta ao resto da especialidade (COLUNAS de MSK). */
  pacoteAParte: boolean;
}

/**
 * Uma fatia da mistura entre segmentos. Segmento nulo = o geral (exame sem segmento) da
 * especialidade; especialidade nula = o segmento em qualquer especialidade (COLUNAS é de NEURO e
 * de MSK).
 */
export interface FatiaMistura {
  especialidadeId: string | null;
  subespecialidadeId: string | null;
}

/** Comportamento de uma frente (especialidade ou modalidade do catálogo) na distribuição. */
export interface RegrasFrente {
  frente: FrenteEscala;
  /** Prioridades que a Lista desta frente aceita; vazio = todas. */
  listaPrioridadeIds: string[];
  /** Prazo restante mínimo para entrar pela Lista; null = segue o SLA (sem mínimo). */
  listaPrazoMinimoHoras: number | null;
  /** Ao fim do turno, o exame não aberto volta para a fila (usado pelo recolhimento, não aqui). */
  recolheAoFimDoTurno: boolean;
  /** Falso = a frente é toda manual. */
  distribuiPeloRobo: boolean;
  /** Fecham o período fixo que começa dentro da faixa (o plantão). */
  horariosSemRobo: HorarioSemRobo[];
  divisao: DivisaoFrente;
  /** Teto por médico a cada rodada, além do da escala; null = só o da escala. */
  tetoPorMedico: number | null;
  segmentos: RegraSegmento[];
  /** Mistura entre segmentos de quem lauda mais de uma fatia (a do neurologista); vazio = nenhuma. */
  mistura: FatiaMistura[];
  /** Antes de os turnos posteriores começarem, a Lista fica só com o que eles não vão dar conta. */
  listaDepoisDosFixos: boolean;
}

/** Regras sem nada ligado: o que vale para a frente que não tem cadastro. */
export const REGRAS_NEUTRAS: Omit<RegrasFrente, 'frente'> = {
  listaPrioridadeIds: [],
  listaPrazoMinimoHoras: null,
  recolheAoFimDoTurno: true,
  distribuiPeloRobo: true,
  horariosSemRobo: [],
  divisao: { metodo: 'igualitaria' },
  tetoPorMedico: null,
  segmentos: [],
  mistura: [],
  listaDepoisDosFixos: false,
};

const chaveFrente = (f: FrenteEscala) =>
  f.tipo === 'especialidade' ? `E|${f.especialidadeId}` : `M|${f.modalidadeId}`;

/** Acesso às regras por frente. */
export class RegrasPorFrente {
  private readonly porChave: Map<string, RegrasFrente>;

  constructor(readonly todas: readonly RegrasFrente[]) {
    this.porChave = new Map(todas.map((r) => [chaveFrente(r.frente), r]));
  }

  daFrente(frente: FrenteEscala): RegrasFrente | null {
    return this.porChave.get(chaveFrente(frente)) ?? null;
  }

  daEspecialidade(id: string | null): RegrasFrente | null {
    return id ? (this.porChave.get(`E|${id}`) ?? null) : null;
  }

  daModalidade(id: string | null): RegrasFrente | null {
    return id ? (this.porChave.get(`M|${id}`) ?? null) : null;
  }

  /**
   * As regras que dividem o exame: as da especialidade dele; sem cadastro, as da modalidade.
   * Mesma precedência do `politicaDe` do dashboards-one (especialidade > modalidade).
   */
  doExame(e: { especialidadeId: string | null; modalidadeId: string | null }): RegrasFrente | null {
    return this.daEspecialidade(e.especialidadeId) ?? this.daModalidade(e.modalidadeId);
  }
}

// ---------------------------------------------------------------------------------------------
// Relógio de Brasília
// ---------------------------------------------------------------------------------------------

/** Brasília sem horário de verão desde 2019: UTC−3 fixo é invariante do domínio (como na escala). */
const OFFSET_BRASILIA_MS = -3 * 60 * 60 * 1000;

const emBrasilia = (instante: Date) => new Date(instante.getTime() + OFFSET_BRASILIA_MS);

/** Minutos desde a meia-noite de Brasília. */
export const minutosEmBrasilia = (instante: Date): number => {
  const b = emBrasilia(instante);
  return b.getUTCHours() * 60 + b.getUTCMinutes();
};

/** 0 = domingo … 6 = sábado, no calendário de Brasília. */
export const diaSemanaEmBrasilia = (instante: Date): number => emBrasilia(instante).getUTCDay();

export const minutosDoHorario = (h: Horario): number =>
  Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

/** Os minutos do dia dentro da faixa [inicio, fim), que pode cruzar a meia-noite. */
export function naFaixa(faixa: { inicio: Horario; fim: Horario }, minutos: number): boolean {
  const ini = minutosDoHorario(faixa.inicio);
  const fim = minutosDoHorario(faixa.fim);
  return fim > ini ? minutos >= ini && minutos < fim : minutos >= ini || minutos < fim;
}

/** O horário sem robô vale agora (dia da semana e hora de Brasília)? */
export function horarioSemRoboVigente(h: HorarioSemRobo, agora: Date): boolean {
  if (h.diasSemana.length && !h.diasSemana.includes(diaSemanaEmBrasilia(agora))) return false;
  return naFaixa(h, minutosEmBrasilia(agora));
}
