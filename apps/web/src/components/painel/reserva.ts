/**
 * Classes da página que tem um `PainelLateral` ao lado da lista: no computador, reserva a faixa do
 * painel aberto (400px, ou 720px no largo, menos o padding da página) enquanto ele está aberto ou
 * entrando, e acompanha a entrada e a saída dele, encolhendo e voltando a lista no mesmo ritmo do
 * deslize.
 *
 * Só em tela que é lista ou tabela que sabe perder colunas (cadastros, usuários, avisos, via
 * `ListaCadastro`). Grade, calendário, quadro e formulário (Escala, Distribuição) não usam: o painel
 * fica por cima, sem encolher nada, e rola até o item clicado se ele ficar embaixo.
 */
export const RESERVA_DO_PAINEL = [
  'transition-[padding] duration-200 ease-out motion-reduce:transition-none',
  "lg:[body:has([data-painel-lateral='padrao']:not([data-ending-style]))_&]:pr-[392px]",
  "lg:[body:has([data-painel-lateral='larga']:not([data-ending-style]))_&]:pr-[712px]",
].join(' ');
