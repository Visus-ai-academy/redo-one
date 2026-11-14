/** Como a entidade aparece nas mensagens e na auditoria. */
export interface Rotulo {
  /** Nome na auditoria, no singular e em snake_case: `modalidade`, `categoria_exame`. */
  entidade: string;
  /** Nome para a pessoa: `Modalidade`, `Contratado`. */
  singular: string;
  genero: 'f' | 'm';
}
