export const COMPETENCIAS_BLOQUEADAS = Symbol('COMPETENCIAS_BLOQUEADAS');

/**
 * Competências fechadas ou com a importação travada ("YYYY-MM"): os laudos delas não mudam.
 * A tabela de competências é do `faturamento`; até ele existir, nenhuma está bloqueada.
 */
export interface CompetenciasBloqueadas {
  listar(): Promise<string[]>;
}
