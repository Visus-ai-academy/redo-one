import { exigirSemErros } from './erros';
import { AJUSTES_DIA_NAO_UTIL, type AjusteDiaNaoUtil } from './recorrencia';

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
  /** Quantos meses à frente as recorrências geram os títulos. */
  horizonteRecorrenciaMeses: number;
  /** Vencimento em fim de semana ou feriado, nas recorrências que não escolhem o seu. */
  ajusteDiaNaoUtil: AjusteDiaNaoUtil;
}

/**
 * O que vale para a empresa que ainda não gravou as suas regras (o mesmo default das colunas):
 * as faixas do dashboards-one, 3 meses de antecedência e o vencimento que posterga.
 */
export const CONFIGURACAO_PADRAO: ConfiguracaoFinanceira = {
  faixasInadimplencia: [...FAIXAS_PADRAO],
  horizonteRecorrenciaMeses: 3,
  ajusteDiaNaoUtil: 'posterga',
};

/** Valida as regras: faixas, horizonte de 1 a 24 meses e o ajuste do vencimento. */
export function prepararConfiguracao(entrada: ConfiguracaoFinanceira): ConfiguracaoFinanceira {
  const faixasInadimplencia = prepararFaixas(entrada.faixasInadimplencia);
  const erros: Record<string, string> = {};
  const meses = entrada.horizonteRecorrenciaMeses;
  if (!Number.isInteger(meses) || meses < 1 || meses > 24) {
    erros.horizonteRecorrenciaMeses = 'Use de 1 a 24 meses.';
  }
  if (!(AJUSTES_DIA_NAO_UTIL as readonly string[]).includes(entrada.ajusteDiaNaoUtil)) {
    erros.ajusteDiaNaoUtil = 'Escolha o que fazer com o vencimento em fim de semana.';
  }
  exigirSemErros(erros);
  return {
    faixasInadimplencia,
    horizonteRecorrenciaMeses: meses,
    ajusteDiaNaoUtil: entrada.ajusteDiaNaoUtil,
  };
}

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
