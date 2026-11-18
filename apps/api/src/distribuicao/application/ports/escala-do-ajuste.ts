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
  /** O dia é de plantão do vínculo (na cobertura, também do titular)? */
  ehDiaDePlantao(alocacaoId: string, data: string): Promise<boolean>;
  /** O recorte do ator, para filtrar listagens. */
  recorteDo(ator: AtorEscala): Promise<NoRecorte>;
}
