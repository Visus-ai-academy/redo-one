/** Regra aprovada: pelo menos 8 caracteres, com pelo menos uma letra e um número. */
export const SENHA_TAMANHO_MINIMO = 8;

/** Lista o que falta na senha, em frases para a pessoa; vazia quando a senha serve. */
export function problemasDaSenha(senha: string): string[] {
  const problemas: string[] = [];
  if ([...senha].length < SENHA_TAMANHO_MINIMO) {
    problemas.push(`Use pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`);
  }
  if (!/\p{L}/u.test(senha) || !/\p{N}/u.test(senha)) problemas.push('Use letras e números.');
  return problemas;
}
