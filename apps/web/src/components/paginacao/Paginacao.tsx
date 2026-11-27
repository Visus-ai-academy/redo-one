import { Button } from '@base-ui/react/button';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { buttonClassName } from '../button/button-class';
import { faixaDaPagina } from './faixa';

type PaginacaoProps = {
  pagina: number;
  porPagina: number;
  total: number;
  onIrPara: (pagina: number) => void;
  /** Totais da lista (ex.: "Em aberto R$ … · vencido R$ …"): à esquerda, com a faixa à direita. */
  resumo?: ReactNode;
};

/** Rodapé das listagens: contagem (ou o resumo) à esquerda, anterior/próxima à direita. */
export function Paginacao({ pagina, porPagina, total, onIrPara, resumo }: PaginacaoProps) {
  const ultima = Math.max(1, Math.ceil(total / porPagina));
  const botao = buttonClassName({ variant: 'secondary', className: 'size-9 px-0' });
  const faixa = (
    <span className="text-muted-foreground text-[13px] tabular-nums">
      {faixaDaPagina(pagina, porPagina, total)}
    </span>
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2">
      {resumo ? (
        <span className="text-muted-foreground min-w-0 text-[13px] tabular-nums">{resumo}</span>
      ) : (
        faixa
      )}
      <span className="flex items-center gap-2">
        {resumo && faixa}
        <Button
          type="button"
          aria-label="Página anterior"
          disabled={pagina <= 1}
          onClick={() => onIrPara(pagina - 1)}
          className={botao}
        >
          <CaretLeft size={16} aria-hidden />
        </Button>
        <Button
          type="button"
          aria-label="Próxima página"
          disabled={pagina >= ultima}
          onClick={() => onIrPara(pagina + 1)}
          className={botao}
        >
          <CaretRight size={16} aria-hidden />
        </Button>
      </span>
    </div>
  );
}
