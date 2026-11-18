import { Popover } from '@base-ui/react/popover';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

type CelulaComPopoverProps = {
  /** Nome do botão para o leitor de tela: a célula e o valor (ex.: "ROTINA na Lista: ≥ 24 h"). */
  rotulo: string;
  /** Título do editor que abre. */
  titulo: ReactNode;
  /** O que se lê na célula: curto, numa linha só. */
  valor: ReactNode;
  /** O editor da célula (aplica no lugar, sem botão de confirmar). */
  children: ReactNode;
  invalida?: boolean;
  className?: string;
};

/**
 * Célula de grade que se edita num popover do Base UI: a célula mostra só o valor curto, com
 * altura fixa; o clique (ou Enter) abre o editor ao lado, sem mudar o tamanho da linha. Vai dentro
 * de um `<td>`, ocupando a célula inteira.
 */
export function CelulaComPopover({
  rotulo,
  titulo,
  valor,
  children,
  invalida,
  className,
}: CelulaComPopoverProps) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={rotulo}
        aria-invalid={invalida || undefined}
        className={cn(
          'flex h-11 w-full items-center gap-1.5 px-3 text-left whitespace-nowrap',
          'hover:bg-muted data-[popup-open]:bg-muted',
          'focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2',
          invalida && 'outline-destructive outline-2 -outline-offset-2',
          className,
        )}
      >
        {valor}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={16}
          className="z-50 outline-none"
        >
          <Popover.Popup className="bg-popover text-popover-foreground w-[min(320px,calc(100vw-32px))] origin-(--transform-origin) rounded-lg border p-3 text-sm shadow-lg transition-[opacity,scale] duration-150 ease-out outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <Popover.Title className="mb-2 font-semibold">{titulo}</Popover.Title>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
