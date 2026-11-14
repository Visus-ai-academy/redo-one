import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Button } from '@base-ui/react/button';
import { useRef, useState } from 'react';

import { buttonClassName } from '../button/button-class';

type ConfirmarAcaoProps = {
  /** Nome da ação: o mesmo no botão que abre e no que confirma ("Desativar usuário"). */
  acao: string;
  titulo: string;
  /** O que acontece se confirmar ("6 usuários perdem o acesso"). */
  consequencia: string;
  onConfirmar: () => Promise<void> | void;
  desabilitado?: boolean;
};

/** Botão de ação destrutiva com confirmação que diz a consequência; o foco abre no Cancelar. */
export function ConfirmarAcao({
  acao,
  titulo,
  consequencia,
  onConfirmar,
  desabilitado,
}: ConfirmarAcaoProps) {
  const [aberto, setAberto] = useState(false);
  const cancelar = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog.Root open={aberto} onOpenChange={setAberto}>
      <AlertDialog.Trigger
        disabled={desabilitado}
        className={buttonClassName({ variant: 'secondary', className: 'text-destructive' })}
      >
        {acao}
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="bg-foreground/40 fixed inset-0 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <AlertDialog.Popup
          initialFocus={cancelar}
          className="bg-popover text-popover-foreground fixed top-1/2 left-1/2 flex w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl p-6 shadow-xl transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none"
        >
          <div className="flex flex-col gap-2">
            <AlertDialog.Title className="text-lg font-semibold">{titulo}</AlertDialog.Title>
            <AlertDialog.Description className="text-muted-foreground leading-relaxed">
              {consequencia}
            </AlertDialog.Description>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialog.Close ref={cancelar} className={buttonClassName({ variant: 'secondary' })}>
              Cancelar
            </AlertDialog.Close>
            <Button
              type="button"
              onClick={async () => {
                setAberto(false);
                await onConfirmar();
              }}
              className={buttonClassName({ variant: 'destructive' })}
            >
              {acao}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
