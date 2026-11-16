import { normalizarNome } from '../../catalogo/comum/nomes';

/**
 * Chave do estudo para casar com o cadastro de exames e com os valores fora do padrão: tira os
 * sufixos de multiplicidade do fim (" X1 X6") e normaliza. Igual ao `chaveExame` do dashboards-one;
 * aqui vale dos dois lados (lá o valor fora do padrão era gravado com o sufixo e nunca casava).
 */
export function chaveEstudo(estudo: string): string {
  return normalizarNome(estudo.replace(/(?:\s+X\d+)+\s*$/i, ''));
}

/**
 * Chave do estudo para casar com a quebra: porte exato do `limparNomeExameLegado` do
 * dashboards-one (tira X1–X9 e XE em qualquer posição, mas não X10+), depois normaliza.
 */
export function chaveEstudoLimpo(estudo: string): string {
  return normalizarNome(estudo.replace(/\s+X[1-9]\b/gi, '').replace(/\s+XE\b/gi, ''));
}
