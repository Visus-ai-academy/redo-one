export const CONTAS_POR_UNIDADE = Symbol('CONTAS_POR_UNIDADE');

export interface LeituraContasUnidade {
  /** Unidade (id na MobileMed) → contas de médico liberadas nela. */
  porUnidade: Map<number, ReadonlySet<number>>;
  /** Unidades cuja lista não pôde ser lida agora (nelas a proposta não confere). */
  falharam: number[];
  /** Quantas listas foram lidas na MobileMed nesta chamada (o resto veio da memória). */
  lidasAgora: number;
}

/**
 * A lista de médicos (contas) liberados em cada unidade da MobileMed, para a proposta não oferecer
 * o exame a quem não pode recebê-lo lá. Guardada na memória do processo entre rodadas: vale
 * `validadeMin` minutos; a que venceu ou nunca foi lida é lida agora, uma vez por unidade. Se a
 * API reinicia, relê. A execução não usa esta lista: confere ao vivo antes de atribuir.
 */
export interface ContasPorUnidade {
  liberadas(unidades: readonly number[], validadeMin: number): Promise<LeituraContasUnidade>;
}
