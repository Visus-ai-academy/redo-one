import type { CadastrosIngestao } from '../../domain/preparar-laudo';

export const CADASTROS_INGESTAO = Symbol('CADASTROS_INGESTAO');

/** Retrato do catálogo e dos médicos, carregado uma vez por importação. */
export interface LeitorCadastrosIngestao {
  carregar(): Promise<CadastrosIngestao>;
}
