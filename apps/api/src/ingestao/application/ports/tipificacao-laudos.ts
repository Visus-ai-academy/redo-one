import type { Tipificador } from '../../../faturamento/domain/tipificacao';

export const TIPIFICACAO_LAUDOS = Symbol('TIPIFICACAO_LAUDOS');

/** A tipificação configurada no `faturamento`, lida uma vez por importação ou reclassificação. */
export interface LeitorTipificacao {
  /** Nulo enquanto não há regras de tipificação cadastradas: os laudos ficam sem tipificação. */
  carregar(): Promise<Tipificador | null>;
}
