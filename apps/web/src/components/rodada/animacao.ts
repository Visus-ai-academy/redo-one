/**
 * Abrir e fechar um `Collapsible.Panel` do Base UI: a altura anima de 0 até a do conteúdo (a
 * variável `--collapsible-panel-height`), em 150 ms ease-out; sem animação com movimento reduzido.
 * Padding vertical no painel faria pular no fim: ponha o espaço no conteúdo.
 */
export const PAINEL_ANIMADO =
  'h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out data-[ending-style]:h-0 data-[starting-style]:h-0 motion-reduce:transition-none';
