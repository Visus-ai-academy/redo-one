import { Button } from '@base-ui/react/button';
import { CaretDown, CaretUp, CaretUpDown } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export type Ordenacao<C extends string = string> = { coluna: C; direcao: 'asc' | 'desc' };

type CabecalhoOrdenavelProps<C extends string> = {
  coluna: C;
  ordenacao: Ordenacao<C>;
  onOrdenar: (ordenacao: Ordenacao<C>) => void;
  /** Coluna de número: fica à direita e o primeiro clique ordena do maior para o menor. */
  numerico?: boolean;
  children: ReactNode;
};

/**
 * Cabeçalho de coluna que ordena a lista (pela API: quem usa guarda a ordem na URL). Clicar ordena
 * por ela; clicar de novo inverte. O `DataTable` recebe a mesma `ordenacao` e põe o `aria-sort`.
 */
export function CabecalhoOrdenavel<C extends string>({
  coluna,
  ordenacao,
  onOrdenar,
  numerico = false,
  children,
}: CabecalhoOrdenavelProps<C>) {
  const ativa = ordenacao.coluna === coluna;
  const Icone = !ativa ? CaretUpDown : ordenacao.direcao === 'asc' ? CaretUp : CaretDown;
  const sentido = numerico
    ? ordenacao.direcao === 'asc'
      ? 'do menor para o maior'
      : 'do maior para o menor'
    : ordenacao.direcao === 'asc'
      ? 'de A a Z'
      : 'de Z a A';
  return (
    <Button
      type="button"
      aria-label={ativa ? `${String(children)}, ${sentido}` : undefined}
      onClick={() =>
        onOrdenar({
          coluna,
          direcao: ativa
            ? ordenacao.direcao === 'asc'
              ? 'desc'
              : 'asc'
            : numerico
              ? 'desc'
              : 'asc',
        })
      }
      className={cn(
        'hover:text-foreground focus-visible:outline-ring -mx-1 inline-flex w-[calc(100%+0.5rem)] items-center gap-1 rounded-md px-1 py-1 font-medium focus-visible:outline-2',
        numerico && 'justify-end',
        ativa && 'text-foreground',
      )}
    >
      {children}
      <Icone size={12} aria-hidden className={cn('flex-none', !ativa && 'opacity-60')} />
    </Button>
  );
}
