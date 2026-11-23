import { Lock } from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';

import type { PapelResumoDto } from '../../gen/types/PapelResumoDto';
import { cn } from '../../lib/cn';
import { Paginacao } from '../paginacao/Paginacao';
import { usePaginaLocal } from '../paginacao/use-pagina-local';

const POR_PAGINA = 10;

const usuarios = (total: number) =>
  total === 0 ? 'Nenhum usuário' : total === 1 ? '1 usuário' : `${total} usuários`;

type ListaPapeisProps = {
  papeis: PapelResumoDto[];
  selecionadoId?: string;
};

/**
 * Lista estreita ao lado do editor: cada papel é um link (`?id=`) que abre as permissões dele;
 * Ctrl/⌘+clique abre em outra aba.
 */
export function ListaPapeis({ papeis, selecionadoId }: ListaPapeisProps) {
  const indice = papeis.findIndex((papel) => papel.id === selecionadoId);
  const paginacao = usePaginaLocal(
    papeis,
    POR_PAGINA,
    indice < 0 ? 1 : Math.floor(indice / POR_PAGINA) + 1,
  );

  return (
    <div className="bg-card min-w-0 overflow-hidden rounded-lg border">
      <ul aria-label="Papéis">
        {paginacao.itensDaPagina.map((papel, posicao) => {
          const atual = papel.id === selecionadoId;
          return (
            <li key={papel.id} className={cn(posicao > 0 && 'border-t')}>
              <Link
                to="."
                search={{ id: papel.id } as never}
                aria-current={atual ? 'page' : undefined}
                className={cn(
                  'focus-visible:outline-ring flex min-h-13 w-full items-center gap-2 py-2 pr-3 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2',
                  atual ? 'bg-accent' : 'hover:bg-muted',
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn('truncate', atual ? 'font-semibold' : 'font-medium')}>
                    {papel.nome}
                  </span>
                  <span className="text-muted-foreground text-[13px] tabular-nums">
                    {usuarios(papel.totalUsuarios)}
                  </span>
                </span>
                {papel.sistema && (
                  <Lock
                    size={16}
                    role="img"
                    aria-label="Papel do sistema"
                    className="text-subtle-foreground flex-none"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      {paginacao.precisaPaginar && (
        <Paginacao
          pagina={paginacao.pagina}
          porPagina={paginacao.porPagina}
          total={paginacao.total}
          onIrPara={paginacao.irPara}
        />
      )}
    </div>
  );
}
