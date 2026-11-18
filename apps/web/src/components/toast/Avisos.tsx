import { Toast } from '@base-ui/react/toast';
import { CheckCircle, X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { buttonClassName } from '../button/button-class';

/**
 * Confirmações que flutuam (toast do Base UI): "Dados salvos.", "Sessão encerrada.". O sucesso
 * não ocupa espaço na tela nem empurra a lista; erro que pede ação continua no fluxo, com o
 * `Alerta`. Montado uma vez no `AppShell`; as telas chamam `useAvisos().sucesso(texto)`.
 *
 * Posição (regra do `sistema.md`): centralizado embaixo da área de conteúdo, entre o menu e o
 * painel lateral aberto, para não cobrir os botões do painel nem os de rodapé (que ficam nas
 * pontas). Sem espaço ao lado do painel (painel de tela cheia ou o largo em tela estreita), vai
 * para o topo, longe dos botões do rodapé e livre do X. A conta fica em `.faixa-avisos`.
 */
export function Avisos({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider timeout={5000}>
      {children}
      <Toast.Portal>
        <Toast.Viewport
          aria-label="Avisos"
          data-avisos=""
          className="faixa-avisos pointer-events-none fixed z-50 flex flex-col items-center gap-2 outline-none"
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
      className="bg-card text-foreground pointer-events-auto flex w-full max-w-[360px] items-start gap-3 rounded-lg p-3 shadow-lg transition-[opacity,translate] duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0 motion-reduce:transition-none"
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
