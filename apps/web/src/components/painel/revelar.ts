/** Folga entre o item revelado e a borda do painel. */
const FOLGA = 16;

/**
 * Painel por cima de uma grade (Escala): se o item clicado ficou embaixo do painel, rola a grade de
 * lado até ele aparecer. Grade que não rola de lado, ou painel na tela inteira, fica como está.
 */
export function revelarSobOPainel(origem: Element | null, painel: Element | null) {
  if (!origem || !painel || painel.contains(origem)) return;
  const item = origem.getBoundingClientRect();
  const faixa = painel.getBoundingClientRect();
  if (faixa.left <= 0 || item.right <= faixa.left || item.left >= faixa.right) return;

  for (let el = origem.parentElement; el; el = el.parentElement) {
    const rolaDeLado =
      el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX);
    if (!rolaDeLado) continue;
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: item.right - faixa.left + FOLGA, behavior: reduzir ? 'auto' : 'smooth' });
    return;
  }
}
