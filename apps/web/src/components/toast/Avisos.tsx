import { Toast } from '@base-ui/react/toast';
import { CheckCircle, X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { buttonClassName } from '../button/button-class';

/**
 * Confirmações que flutuam no canto (toast do Base UI): "Dados salvos.", "Sessão encerrada.". O
 * sucesso não ocupa espaço na tela nem empurra a lista; erro que pede ação continua no fluxo, com
 * o `Alerta`. Montado uma vez no `AppShell`; as telas chamam `useAvisos().sucesso(texto)`.
 */
export function Avisos({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider timeout={5000}>
      {children}
      <Toast.Portal>
        <Toast.Viewport
          aria-label="Avisos"
          className="fixed right-4 bottom-4 z-50 flex w-[min(360px,calc(100vw-32px))] flex-col gap-2 outline-none"
        >
          <ListaDeAvisos />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ListaDeAvisos() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((aviso) => (
    <Toast.Root
      key={aviso.id}
      toast={aviso}
      className="bg-card text-foreground flex items-start gap-3 rounded-lg p-3 shadow-lg transition-[opacity,translate] duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0 motion-reduce:transition-none"
    >
      <CheckCircle size={18} aria-hidden className="text-success mt-px flex-none" />
      <Toast.Title className="min-w-0 flex-1 leading-normal" />
      <Toast.Close
        aria-label="Fechar aviso"
        className={buttonClassName({
          variant: 'ghost',
          className: 'text-muted-foreground -my-1 size-7 flex-none px-0',
        })}
      >
        <X size={16} aria-hidden />
      </Toast.Close>
    </Toast.Root>
  ));
}
