const numero = new Intl.NumberFormat('pt-BR');

/** "1–25 de 47": faixa da página atual e o total, como pede a regra de listagens do One. */
export function faixaDaPagina(pagina: number, porPagina: number, total: number) {
  if (total === 0) return '0 de 0';
  const inicio = (pagina - 1) * porPagina + 1;
  const fim = Math.min(pagina * porPagina, total);
  const faixa =
    inicio === fim ? numero.format(inicio) : `${numero.format(inicio)}–${numero.format(fim)}`;
  return `${faixa} de ${numero.format(total)}`;
}
