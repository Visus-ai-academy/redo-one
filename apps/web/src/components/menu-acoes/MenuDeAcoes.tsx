import { Menu } from '@base-ui/react/menu';
import { DotsThree } from '@phosphor-icons/react';

import { cn } from '../../lib/cn';
import { buttonClassName } from '../button/button-class';

export type AcaoDoMenu = {
  /** Termina em "…" quando abre outra etapa antes de agir ("Cancelar título…"). */
  rotulo: string;
  onEscolher: () => void;
  /** Ação destrutiva (cancelar, encerrar): texto na cor de erro. */
  destrutiva?: boolean;
  /** Por que não dá agora; com isso, o item fica desabilitado e o motivo aparece embaixo. */
  desabilitada?: string;
};

/**
 * Menu "⋯" das ações raras de um item (prorrogar, cancelar, pausar...), sobre o Menu do Base UI.
 * Sem ações, não aparece.
 */
export function MenuDeAcoes({
  acoes,
  'aria-label': ariaLabel,
}: {
  acoes: AcaoDoMenu[];
  'aria-label': string;
}) {
  if (acoes.length === 0) return null;
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={ariaLabel}
        className={buttonClassName({ variant: 'secondary', className: 'size-9 px-0' })}
      >
        <DotsThree size={18} aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={4} className="z-50 outline-none">
          <Menu.Popup className="bg-popover text-popover-foreground min-w-[200px] origin-(--transform-origin) rounded-lg border py-1 text-sm shadow-lg transition-[opacity,scale] duration-150 ease-out outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
            {acoes.map((acao) => (
              <Menu.Item
                key={acao.rotulo}
                disabled={Boolean(acao.desabilitada)}
                onClick={acao.onEscolher}
                className="data-[highlighted]:bg-muted flex min-h-9 max-w-80 flex-col items-start gap-0.5 px-3 py-2 outline-none data-[disabled]:cursor-not-allowed"
              >
                <span
                  className={cn(
                    acao.desabilitada
                      ? 'text-muted-foreground'
                      : acao.destrutiva
                        ? 'text-destructive'
                        : undefined,
                  )}
                >
                  {acao.rotulo}
                </span>
                {acao.desabilitada && (
                  <span className="text-muted-foreground text-xs leading-snug">
                    {acao.desabilitada}
                  </span>
                )}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
