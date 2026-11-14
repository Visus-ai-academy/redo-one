/**
 * Classes da página que tem um `PainelLateral` ao lado da lista: no computador, reserva a faixa do
 * painel (400px menos o padding da página) enquanto ele está aberto ou entrando, e acompanha a
 * entrada e a saída dele, encolhendo e voltando a lista no mesmo ritmo do deslize.
 */
export const RESERVA_DO_PAINEL =
  'transition-[padding] duration-200 ease-out motion-reduce:transition-none lg:[body:has([data-painel-lateral]:not([data-ending-style]))_&]:pr-[392px]';
