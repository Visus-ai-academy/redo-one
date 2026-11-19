import { ErroMobileMed } from '../../../comum/mobilemed/cliente-mobilemed';

/** Janela que, mesmo no teto, não se divide mais: a importação para. */
const MENOR_JANELA_MS = 60_000;

/**
 * Busca o período `[de, ate)` em janelas de `janelaMs`, uma chamada por vez. O relatório da
 * MobileMed não pagina: acima do teto, a lista vem cortada em silêncio. Por isso a janela que volta
 * com `teto` itens ou mais é refeita em duas metades, até ficar abaixo; uma resposta no teto nunca
 * é aceita como completa.
 */
export async function buscarFatiado<T>(
  de: Date,
  ate: Date,
  janelaMs: number,
  teto: number,
  buscar: (de: Date, ate: Date) => Promise<T[]>,
): Promise<T[]> {
  const itens: T[] = [];
  const pendentes: [number, number][] = [];
  for (let a = de.getTime(); a < ate.getTime(); a += janelaMs) {
    pendentes.push([a, Math.min(a + janelaMs, ate.getTime())]);
  }
  for (let janela = pendentes.shift(); janela; janela = pendentes.shift()) {
    const [a, b] = janela;
    const lista = await buscar(new Date(a), new Date(b));
    if (lista.length < teto) {
      itens.push(...lista);
      continue;
    }
    if (b - a <= MENOR_JANELA_MS) {
      throw new ErroMobileMed(
        'resposta_inesperada',
        `MobileMed: o relatório veio no teto de ${teto} registros mesmo numa janela de 1 minuto.`,
      );
    }
    const meio = a + Math.floor((b - a) / 2);
    pendentes.unshift([a, meio], [meio, b]);
  }
  return itens;
}
