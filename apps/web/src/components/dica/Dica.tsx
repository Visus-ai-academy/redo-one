import { Tooltip } from '@base-ui/react/tooltip';
import type { ReactElement } from 'react';

type DicaProps = {
  rotulo: string;
  /** O elemento que recebe a dica (botão, link); ele mantém o próprio `aria-label`. */
  children: ReactElement;
  lado?: 'top' | 'right' | 'bottom' | 'left';
  /** Ex.: no menu aberto, o nome já está à vista. */
  desativada?: boolean;
};

/**
 * Rótulo visual ao passar o mouse ou focar (ícone sozinho, menu recolhido), sobre o Tooltip do
 * Base UI. Só complementa: a informação essencial nunca fica só na dica, e o elemento tem nome.
 */
export function Dica({ rotulo, children, lado = 'right', desativada = false }: DicaProps) {
  return (
    <Tooltip.Root disabled={desativada}>
      <Tooltip.Trigger render={children} delay={300} />
      <Tooltip.Portal>
        <Tooltip.Positioner side={lado} sideOffset={8} className="z-50">
          <Tooltip.Popup className="bg-foreground text-background rounded-md px-2 py-1 text-[13px] shadow-md transition-opacity duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            {rotulo}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
