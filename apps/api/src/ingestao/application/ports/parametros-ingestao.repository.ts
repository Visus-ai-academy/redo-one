export const PARAMETROS_INGESTAO_REPOSITORY = Symbol('PARAMETROS_INGESTAO_REPOSITORY');

export interface ParametrosIngestao {
  travaRemocaoMinimo: number;
  travaRemocaoFator: number;
  retencaoLinhasBrutasDias: number;
}

export interface ParametrosIngestaoRepository {
  obter(): Promise<ParametrosIngestao>;
}
