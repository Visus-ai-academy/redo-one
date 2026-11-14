import { Tabs } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export type Aba = { valor: string; rotulo: string };

type AbasProps = {
  abas: Aba[];
  valor: string;
  /** Quem usa guarda a aba na URL (`?aba=`): dá para voltar, recarregar e mandar o link. */
  onMudar: (valor: string) => void;
  'aria-label': string;
  /** Conteúdo da aba atual (só ele é montado). */
  children: ReactNode;
  className?: string;
};

/** Subtelas do mesmo assunto (ex.: as listas do catálogo), sobre o Tabs do Base UI. */
export function Abas({
  abas,
  valor,
  onMudar,
  'aria-label': ariaLabel,
  children,
  className,
}: AbasProps) {
  return (
    <Tabs.Root
      value={valor}
      onValueChange={(novo) => onMudar(String(novo))}
      className={cn('flex flex-col gap-5', className)}
    >
      <Tabs.List aria-label={ariaLabel} className="flex gap-1 overflow-x-auto border-b">
        {abas.map((aba) => (
          <Tabs.Tab
            key={aba.valor}
            value={aba.valor}
            className={cn(
              'text-muted-foreground hover:text-foreground -mb-px h-9 border-b-2 border-transparent px-3 whitespace-nowrap',
              'focus-visible:outline-ring rounded-t-md focus-visible:outline-2 focus-visible:-outline-offset-2',
              'data-[active]:border-primary data-[active]:text-foreground data-[active]:font-medium',
            )}
          >
            {aba.rotulo}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <Tabs.Panel
        value={valor}
        className="focus-visible:outline-ring flex flex-col gap-5 focus-visible:outline-2"
      >
        {children}
      </Tabs.Panel>
    </Tabs.Root>
  );
}
