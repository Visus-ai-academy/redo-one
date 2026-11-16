/**
 * Convenção dos eventos de auditoria da escala (`eventos_auditoria`). O Histórico da escala filtra
 * por médico e aplica o recorte da gestora lendo estas chaves do `depois` (ou do `antes`, quando o
 * registro foi removido); por isso todo evento da escala as leva, mesmo que não tenham mudado.
 */

/** Entidades da escala no histórico. */
export const ENTIDADES_ESCALA = [
  'turno',
  'frente_escala',
  'tipo_ausencia',
  'alocacao',
  'ajuste_produtividade',
  'ausencia',
  'escopo_escala',
] as const;

export type EntidadeEscala = (typeof ENTIDADES_ESCALA)[number];

/**
 * Chaves de contexto que todo evento de alocação, ajuste e ausência carrega no JSON:
 * - alocação e ajuste: `medicoId`, `turnoId`, `frenteId`;
 * - ausência: `medicoId`, `turnoIds`, `frenteIds` (vazios = todos).
 * Turno, frente, tipo de ausência e escopo não têm médico: só gestor sem recorte os vê.
 */
export interface ContextoEventoEscala {
  medicoId?: string;
  turnoId?: string;
  frenteId?: string;
  turnoIds?: string[];
  frenteIds?: string[];
}
