import { Toggle } from '@base-ui/react/toggle';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

type AlternadorProps = {
  ligado: boolean;
  onMudar: (ligado: boolean) => void;
  children: ReactNode;
  className?: string;
};

/**
 * Um botão que fica ligado ou desligado (ex.: "Fim de semana" na escala), sobre o Toggle do Base
 * UI; ligado, ganha o fundo do acento suave, como a opção marcada da `EscolhaSegmentada`.
 */
export function Alternador({ ligado, onMudar, children, className }: AlternadorProps) {
  return (
    <Toggle
      pressed={ligado}
      onPressedChange={(valor) => onMudar(valor)}
      className={cn(
        'border-input bg-card text-muted-foreground hover:text-foreground inline-flex h-9 items-center gap-2 rounded-md border px-3 whitespace-nowrap',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-1',
        'data-[pressed]:bg-accent data-[pressed]:text-foreground data-[pressed]:font-medium',
        className,
      )}
    >
      {children}
    </Toggle>
  );
}
