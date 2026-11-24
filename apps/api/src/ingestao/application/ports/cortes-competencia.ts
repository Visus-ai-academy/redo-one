import type { TabelaCortes } from '../../domain/competencia';

export const CORTES_COMPETENCIA = Symbol('CORTES_COMPETENCIA');

/** Cortes da competência (padrão e por cliente, com vigências), configurados no `faturamento`. */
export interface LeitorCortesCompetencia {
  /** Sem vigência padrão gravada, o padrão é o `CORTE_PADRAO_INICIAL`. */
  carregar(): Promise<TabelaCortes>;
}
