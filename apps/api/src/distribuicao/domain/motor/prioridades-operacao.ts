import type { FrenteEscala } from '../arranjo';
import type { RegrasPorFrente } from './configuracao';

/**
 * Prioridades da operação (decisões de 18/11/2026): cadastro próprio da distribuição, separado
 * das 3 prioridades do catálogo (que seguem no faturamento, na escala e no arranjo). Cada uma tem
 * posição na fila, regra de urgência e um de-para próprio de grafias da MobileMed. O recebimento
 * é uma grade prioridade da operação × turno da escala, com sobrescrita por frente; a Lista
 * deixou de ser especial (é só mais uma coluna). Tudo é dado da configuração.
 */

/** Quando a operação trata a prioridade como urgência. */
export type RegraUrgencia =
  | { tipo: 'nunca' }
  | { tipo: 'sempre' }
  /** Quando o prazo restante fica abaixo de N horas (o vencido também). */
  | { tipo: 'prazo'; horas: number };

/** O que um turno recebe de uma prioridade. */
export type RegraRecebimento =
  | { tipo: 'segue_sla' }
  /** Só o exame com prazo restante acima de N horas (prazo ilegível não entra). */
  | { tipo: 'prazo_minimo'; horas: number }
  | { tipo: 'nao_recebe' };

export interface PrioridadeOperacao {
  id: string;
  nome: string;
  /** 1 = primeiro na fila; empate permitido. */
  posicao: number;
  urgencia: RegraUrgencia;
  /**
   * Marcada na alocação, o exame urgente desta prioridade segue o SLA mesmo contra a célula da
   * grade (19/11/2026: ligada só na URGÊNCIA; o INTERNADO segue a célula).
   */
  furaGradeNaAlocacao: boolean;
  /** Vale para a grafia sem de-para (e para o exame sem prioridade). */
  padrao: boolean;
  /** Grafias da MobileMed que caem nesta prioridade. */
  grafias: readonly string[];
  /** Hex `#RRGGBB` da prioridade nas telas (barra da fila do momento); null = neutra. */
  cor: string | null;
}

/** Uma célula da grade de recebimento. */
export interface CelulaRecebimento {
  prioridadeOperacaoId: string;
  turnoId: string;
  regra: RegraRecebimento;
}

/** A urgência de uma prioridade sobrescrita numa frente. */
export interface UrgenciaFrente {
  prioridadeOperacaoId: string;
  urgencia: RegraUrgencia;
}

export const SEGUE_SLA: RegraRecebimento = { tipo: 'segue_sla' };

/** Sem acento, sem espaços nas pontas e em maiúsculas (o de-para não diferencia). */
export const normalizarGrafia = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

export interface LeituraPrioridade {
  prioridade: PrioridadeOperacao | null;
  /** A grafia não está em nenhum de-para: vale a padrão e vira aviso. */
  semDePara: boolean;
}

/** Grafia da MobileMed → prioridade da operação; sem de-para, a padrão. */
export function criarLeitorPrioridade(
  prioridades: readonly PrioridadeOperacao[],
): (grafia: string | null) => LeituraPrioridade {
  const porGrafia = new Map<string, PrioridadeOperacao>();
  for (const p of prioridades) {
    for (const g of p.grafias) porGrafia.set(normalizarGrafia(g), p);
  }
  const padrao = prioridades.find((p) => p.padrao) ?? null;
  return (grafia) => {
    const achada = grafia === null ? undefined : porGrafia.get(normalizarGrafia(grafia));
    return achada
      ? { prioridade: achada, semDePara: false }
      : { prioridade: padrao, semDePara: true };
  };
}

/** A regra de urgência vale para este prazo restante (minutos; null = ilegível)? */
export function urgente(regra: RegraUrgencia, restanteMin: number | null): boolean {
  if (regra.tipo === 'sempre') return true;
  if (regra.tipo === 'nunca') return false;
  return restanteMin !== null && restanteMin < regra.horas * 60;
}

/**
 * A urgência da prioridade na frente do exame: a sobrescrita da especialidade, senão a da
 * modalidade, senão a da própria prioridade.
 */
export function urgenciaNaFrente(
  prioridade: PrioridadeOperacao,
  exame: { especialidadeId: string | null; modalidadeId: string | null },
  regras: RegrasPorFrente,
): RegraUrgencia {
  const daFrente = (r: ReturnType<RegrasPorFrente['daEspecialidade']>) =>
    r?.urgencias.find((u) => u.prioridadeOperacaoId === prioridade.id)?.urgencia;
  return (
    daFrente(regras.daEspecialidade(exame.especialidadeId)) ??
    daFrente(regras.daModalidade(exame.modalidadeId)) ??
    prioridade.urgencia
  );
}

/**
 * A grade de recebimento: a célula da frente do período, senão a da grade geral, senão "segue o
 * SLA".
 */
export class GradeRecebimento {
  private readonly geral: Map<string, RegraRecebimento>;

  constructor(
    geral: readonly CelulaRecebimento[],
    private readonly regras: RegrasPorFrente,
  ) {
    this.geral = new Map(geral.map((c) => [`${c.prioridadeOperacaoId}|${c.turnoId}`, c.regra]));
  }

  regra(
    prioridadeOperacaoId: string | null,
    turnoId: string,
    frente: FrenteEscala,
  ): RegraRecebimento {
    if (prioridadeOperacaoId === null) return SEGUE_SLA;
    const daFrente = this.regras
      .daFrente(frente)
      ?.recebimento.find(
        (c) => c.prioridadeOperacaoId === prioridadeOperacaoId && c.turnoId === turnoId,
      );
    return daFrente?.regra ?? this.geral.get(`${prioridadeOperacaoId}|${turnoId}`) ?? SEGUE_SLA;
  }
}
