import { useState } from 'react';

/**
 * Paginação no navegador para listas curtas e limitadas que a API já devolve inteiras (sessões
 * abertas, acessos dos últimos 30 dias). Lista sem limite é paginada pela API, nunca aqui.
 */
export function usePaginaLocal<T>(itens: readonly T[], porPagina: number) {
  const [escolhida, setEscolhida] = useState(1);
  const ultima = Math.max(1, Math.ceil(itens.length / porPagina));
  // A lista pode encolher (ex.: sessões encerradas): nunca fica numa página que não existe mais.
  const pagina = Math.min(escolhida, ultima);

  return {
    pagina,
    porPagina,
    total: itens.length,
    itensDaPagina: itens.slice((pagina - 1) * porPagina, pagina * porPagina),
    precisaPaginar: itens.length > porPagina,
    irPara: setEscolhida,
  };
}
