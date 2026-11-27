import { exigirSemErros } from './erros';

/**
 * Começo (em dias de atraso) de cada faixa da inadimplência, quando a empresa ainda não editou as
 * dela: 1–5, 6–15, 16–30 e mais de 30 dias, as mesmas do dashboards-one. Editável por empresa em
 * Regras financeiras.
 */
export const FAIXAS_PADRAO: readonly number[] = [1, 6, 16, 31];

/** O que se configura por empresa nas Regras financeiras (por enquanto). */
export interface ConfiguracaoFinanceira {
  /** Começo de cada faixa, em ordem, a primeira no dia 1. */
  faixasInadimplencia: number[];
}

export const CONFIGURACAO_PADRAO: ConfiguracaoFinanceira = {
  faixasInadimplencia: [...FAIXAS_PADRAO],
};

const dias = (n: number) => (n === 1 ? '1 dia' : `${n} dias`);

/** "1–5 dias", "Mais de 30 dias". */
export function rotuloDaFaixa(faixas: readonly number[], indice: number): string {
  const inicio = faixas[indice] as number;
  const proxima = faixas[indice + 1];
  if (proxima === undefined) return `Mais de ${dias(inicio - 1)}`;
  if (proxima - 1 === inicio) return dias(inicio);
  return `${inicio}–${proxima - 1} dias`;
}

/** Índice da faixa do atraso (em dias, maior que zero). */
export function faixaDoAtraso(faixas: readonly number[], atraso: number): number {
  let indice = 0;
  faixas.forEach((inicio, i) => {
    if (inicio <= atraso) indice = i;
  });
  return indice;
}

/** Valida e ordena as faixas: de 2 a 8, a primeira no dia 1, sem repetir. */
export function prepararFaixas(entrada: number[]): number[] {
  const erro = (mensagem: string) => exigirSemErros({ faixasInadimplencia: mensagem });
  if (!entrada.every((n) => Number.isInteger(n) && n > 0)) {
    erro('Os dias são números inteiros maiores que zero.');
  }
  if (entrada.length < 2 || entrada.length > 8) erro('Use de 2 a 8 faixas.');
  const faixas = [...entrada].sort((a, b) => a - b);
  if (new Set(faixas).size !== faixas.length) erro('Cada faixa começa num dia diferente.');
  if (faixas[0] !== 1) erro('A primeira faixa começa no dia 1 de atraso.');
  return faixas;
}
