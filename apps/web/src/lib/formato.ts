// Números, moeda, porcentagem e plural em pt-BR via `Intl`: um formato só no sistema inteiro.

/** Espaço não separável: número e unidade nunca quebram de linha separados. */
const NBSP = ' ';

const regrasDePlural = new Intl.PluralRules('pt-BR');
const formatosDeNumero = new Map<number, Intl.NumberFormat>();
const formatosDePorcentagem = new Map<number, Intl.NumberFormat>();

const formatoDeMoeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function emCache(
  cache: Map<number, Intl.NumberFormat>,
  casas: number,
  opcoes: Intl.NumberFormatOptions,
) {
  let formato = cache.get(casas);
  if (!formato) {
    formato = new Intl.NumberFormat('pt-BR', {
      ...opcoes,
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    });
    cache.set(casas, formato);
  }
  return formato;
}

/** `1.234.567`; com `casas`, sempre essa quantidade (`3,00`). */
export function numero(valor: number, casas = 0) {
  return emCache(formatosDeNumero, casas, {}).format(valor);
}

/** Sempre com 2 casas: `R$ 1.234,50`, `-R$ 12,30`. */
export function moeda(valor: number) {
  return formatoDeMoeda.format(valor);
}

/**
 * Da fração (`0.125` → `12,5%`), com a mesma quantidade de `casas` em todo valor: use o mesmo
 * número na coluna inteira.
 */
export function porcentagem(fracao: number, casas = 0) {
  return emCache(formatosDePorcentagem, casas, { style: 'percent' }).format(fracao);
}

/** Número e unidade com espaço não separável: `12 min`, `1.500 laudos`. */
export function comUnidade(valor: number, unidade: string, casas = 0) {
  return `${numero(valor, casas)}${NBSP}${unidade}`;
}

/**
 * Contagem com o plural certo: `1 exame`, `2 exames`; zero vira `nenhum` quando informado
 * ("Nenhum aviso"), nunca "0 aviso(s)".
 *
 * Ex.: `plural(total, { um: 'exame', varios: 'exames', nenhum: 'Nenhum exame' })`.
 */
export function plural(
  quantidade: number,
  textos: { um: string; varios: string; nenhum?: string },
) {
  if (quantidade === 0) return textos.nenhum ?? `0 ${textos.varios}`;
  const palavra = regrasDePlural.select(quantidade) === 'one' ? textos.um : textos.varios;
  return `${numero(quantidade)} ${palavra}`;
}
