import { Popover } from '@base-ui/react/popover';
import { Info } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

/**
 * Ícone de informação ao lado de um título ou cabeçalho que explica o termo (de onde vem o dado,
 * o que conta). Popover do Base UI: abre ao passar o mouse, no clique, no toque e pelo teclado
 * (Enter), e fecha com Esc. Só para explicação; o que é essencial fica escrito na tela.
 */
export function AjudaContextual({
  assunto,
  children,
  className,
}: {
  /** Completa o nome do botão: "Sobre {assunto}". */
  assunto: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={200}
        aria-label={`Sobre ${assunto}`}
        className={cn(
          'text-subtle-foreground hover:text-foreground data-[popup-open]:text-foreground inline-flex size-6 flex-none items-center justify-center rounded-md align-middle',
          'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
          className,
        )}
      >
        <Info size={16} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={16}
          className="z-50 outline-none"
        >
          <Popover.Popup className="bg-popover text-popover-foreground w-[min(320px,calc(100vw-32px))] origin-(--transform-origin) rounded-lg border p-3 text-[13px] font-normal shadow-lg transition-[opacity,scale] duration-150 ease-out outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
