import type { TabelaCortes } from '../../../ingestao/domain/competencia';

export const CORTES_REPOSITORY = Symbol('CORTES_REPOSITORY');

export interface CortesRepository {
  /** Todas as vigências; sem vigência padrão gravada, o padrão é o `CORTE_PADRAO_INICIAL`. */
  carregar(): Promise<TabelaCortes>;
  /** Grava a vigência padrão inicial se não houver nenhuma vigência padrão. Idempotente. */
  garantirPadraoInicial(): Promise<void>;
}
