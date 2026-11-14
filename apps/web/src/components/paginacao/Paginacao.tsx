import { CaretLeft, CaretRight } from '@phosphor-icons/react';

import { buttonClassName } from '../button/button-class';
import { faixaDaPagina } from './faixa';

type PaginacaoProps = {
  pagina: number;
  porPagina: number;
  total: number;
  onIrPara: (pagina: number) => void;
};

/** Rodapé das listagens: contagem à esquerda, anterior/próxima à direita. */
export function Paginacao({ pagina, porPagina, total, onIrPara }: PaginacaoProps) {
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  const botao = buttonClassName({ variant: 'secondary', className: 'size-9 px-0' });

  return (
    <div className="flex items-center justify-between gap-3 border-t px-4 py-2">
      <span className="text-muted-foreground text-[13px] tabular-nums">
        {faixaDaPagina(pagina, porPagina, total)}
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          aria-label="Página anterior"
          disabled={pagina <= 1}
          onClick={() => onIrPara(pagina - 1)}
          className={botao}
        >
          <CaretLeft size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Próxima página"
          disabled={pagina >= ultima}
          onClick={() => onIrPara(pagina + 1)}
          className={botao}
        >
          <CaretRight size={16} aria-hidden />
        </button>
      </span>
    </div>
  );
}
