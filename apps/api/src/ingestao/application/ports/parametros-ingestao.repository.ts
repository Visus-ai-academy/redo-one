export const PARAMETROS_INGESTAO_REPOSITORY = Symbol('PARAMETROS_INGESTAO_REPOSITORY');

export interface ParametrosIngestao {
  travaRemocaoMinimo: number;
  travaRemocaoFator: number;
  retencaoLinhasBrutasDias: number;
  /** Minutos entre duas importações automáticas da MobileMed; `null` = desligada. */
  mobilemedIntervaloMinutos: number | null;
  /** O período começa no dia 1º de tantos meses atrás (1 = do mês anterior até hoje). */
  mobilemedMesesAnteriores: number;
  /** Tamanho inicial de cada chamada ao relatório. */
  mobilemedJanelaDias: number;
  /** Limite de itens por chamada da MobileMed: resposta com isso ou mais é tida como cortada. */
  mobilemedTeto: number;
  /**
   * Unidades de destino cujo compartilhamento entra (o RPA: `RPA_COMPARTILHAMENTO_UNIDADES`,
   * CRD_APOIO). Vazia, o compartilhamento não é importado.
   */
  mobilemedCompartilhamentoUnidades: string[];
}

export interface ParametrosIngestaoRepository {
  obter(): Promise<ParametrosIngestao>;
  salvar(parametros: ParametrosIngestao): Promise<void>;
}
