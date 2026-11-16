export const LINHAS_BRUTAS_REPOSITORY = Symbol('LINHAS_BRUTAS_REPOSITORY');

/** Linhas cruas da planilha (dado de saúde), guardadas só pelo prazo da retenção. */
export interface LinhasBrutasRepository {
  /** Apaga as gravadas antes do instante; devolve quantas. */
  expurgarAntesDe(instante: Date): Promise<number>;
}
