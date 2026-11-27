export const VARIAVEIS_AMBIENTE = Symbol('VARIAVEIS_AMBIENTE');

/** Só diz se uma variável de ambiente existe (não vazia); o valor nunca sai daqui. */
export interface VariaveisAmbiente {
  existe(nome: string): boolean;
}
