export const LAUDOS_COMPETENCIA = Symbol('LAUDOS_COMPETENCIA');

/** Só o que a prévia do corte usa. */
export interface LaudoParaPrevia {
  id: string;
  clienteId: string | null;
  dataRealizacao: Date;
  dataLaudo: Date;
  competencia: string;
}

export interface LotePrevia {
  /** Nulo = todos os clientes (inclusive os laudos sem cliente). */
  clienteId: string | null;
  /** Só laudos com competência igual ou posterior. */
  aPartirDe: string;
  /** Laudos dessas competências ficam de fora. */
  competenciasBloqueadas: string[];
  /** Id do último laudo do lote anterior; nulo no primeiro. */
  depoisDe: string | null;
  limite: number;
}

/** Laudos (não removidos) lidos pelo `faturamento`, em lotes pelo id. */
export interface LaudosCompetencia {
  lerParaPrevia(lote: LotePrevia): Promise<LaudoParaPrevia[]>;
}
