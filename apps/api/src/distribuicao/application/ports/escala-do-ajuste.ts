export const ESCALA_DO_AJUSTE = Symbol('ESCALA_DO_AJUSTE');

/** Quem mexe na escala: o recorte da gestora vale para quem não tem acesso total. */
export interface AtorEscala {
  usuarioId: string;
  acessoTotal: boolean;
}

export interface AlocacaoDoAjuste {
  id: string;
  medicoId: string;
  turnoId: string;
  frenteId: string;
}

export type NoRecorte = (alvo: { turnoId: string; frenteId: string }) => boolean;

/** O que o ajuste do dia da distribuição lê da escala (alocação, dia de plantão, recorte). */
export interface EscalaDoAjuste {
  /** A alocação, se existir e estiver no recorte do ator (fora dele, para a gestora, não existe). */
  alocacaoNoRecorte(ator: AtorEscala, alocacaoId: string): Promise<AlocacaoDoAjuste | null>;
  /**
   * Os dias de [de, ate] que são de plantão do vínculo (na cobertura, também do titular), em
   * ordem. A regra é a da escala (`ehDiaDePlantao`), a mesma do ajuste de produtividade do dia.
   */
  diasDePlantao(alocacaoId: string, de: string, ate: string): Promise<string[]>;
  /** O recorte do ator, para filtrar listagens. */
  recorteDo(ator: AtorEscala): Promise<NoRecorte>;
}
