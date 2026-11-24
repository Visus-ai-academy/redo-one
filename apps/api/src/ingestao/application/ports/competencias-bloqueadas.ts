export const COMPETENCIAS_BLOQUEADAS = Symbol('COMPETENCIAS_BLOQUEADAS');

/** Competências ("YYYY-MM") da tabela do `faturamento`, vistas pela importação. */
export interface CompetenciasBloqueadas {
  /** Fechadas ou com a importação travada: os laudos delas não mudam. */
  listar(): Promise<string[]>;
  /** Cria como aberta as que ainda não têm linha; as que já existem ficam como estão. */
  garantir(competencias: string[]): Promise<void>;
}
