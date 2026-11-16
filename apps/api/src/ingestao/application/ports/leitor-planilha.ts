import type { Readable } from 'node:stream';

import type { Celula } from '../../domain/celulas';

export const LEITOR_PLANILHA = Symbol('LEITOR_PLANILHA');

export type FormatoPlanilha = 'laudos' | 'compartilhamento';

export interface PlanilhaLida {
  formato: FormatoPlanilha;
  /** Registros por coluna (nomes da MobileMed, em maiúsculas); `numero` é a linha na planilha. */
  linhas: { numero: number; registro: Record<string, Celula> }[];
}

/** Lê o relatório de laudos da MobileMed. Lança `PlanilhaInvalidaError` se faltar coluna. */
export interface LeitorPlanilha {
  ler(conteudo: Readable): Promise<PlanilhaLida>;
}

export class PlanilhaInvalidaError extends Error {}
