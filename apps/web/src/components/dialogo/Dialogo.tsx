import { Dialog } from '@base-ui/react/dialog';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { buttonClassName } from '../button/button-class';
import { PedirFechamento, useDescartarAlteracoes } from '../painel/fechamento';

type DialogoProps = {
  titulo: ReactNode;
  /** Uma linha abaixo do título: o que a tarefa faz ou a consequência. */
  descricao?: ReactNode;
  /** Ação primária, à direita do "Cancelar" (ex.: `<form.AppForm><form.SubmitButton>`). */
  acao: ReactNode;
  /** Com `onEnviar`, conteúdo e rodapé formam um `<form>`: Enter num campo envia. */
  onEnviar?: () => void;
  onFechar: () => void;
  /**
   * Formulário com alterações não salvas (`useAlterado(form, iniciais)`): fechar pelo Cancelar,
   * Esc ou clique fora pergunta antes "Descartar as alterações?".
   */
  alterado?: boolean;
  children: ReactNode;
};

/** Primeiro campo do conteúdo, para o foco começar nele (não no Cancelar). */
const CAMPO =
  'input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), [role="combobox"]:not([data-disabled]), [role="checkbox"]:not([data-disabled])';

/**
 * Diálogo modal para tarefa curta e atômica (criar algo simples, convidar, informar um motivo):
 * até ~6 campos, sem abas nem listas, termina num clique. Sobre o Dialog do Base UI: 480px no
 * centro, raio de 12px, título, conteúdo e rodapé com "Cancelar" e a ação primária à direita; no
 * celular, folha que sobe de baixo. Entra e sai esmaecendo e crescendo (150ms); quem usa só fica
 * sabendo do fechamento (`onFechar`) depois da saída. O foco começa no primeiro campo e volta para
 * quem abriu ao fechar; Esc fecha.
 *
 * Ver ou editar um item de uma lista, com abas ou histórico, é no `PainelLateral`; confirmação
 * destrutiva, no `ConfirmarAcao`.
 */
export function Dialogo({
  titulo,
  descricao,
  acao,
  onEnviar,
  onFechar,
  alterado = false,
  children,
}: DialogoProps) {
  // Monta fechado e abre em seguida: o Base UI só anima a entrada quando `open` muda.
  const [aberto, setAberto] = useState(false);
  const fechando = useRef(false);
  const popup = useRef<HTMLDivElement>(null);
  const { pedir, confirmacao } = useDescartarAlteracoes();

  useEffect(() => setAberto(true), []);

  const fechar = () =>
    pedir(alterado, () => {
      fechando.current = true;
      setAberto(false);
    });

  const corpo = (
    <>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-1">
        {children}
      </div>
      <div className="flex flex-none flex-wrap justify-end gap-2 px-6 pt-4 pb-6">
        <Dialog.Close className={buttonClassName({ variant: 'secondary' })}>Cancelar</Dialog.Close>
        {acao}
      </div>
    </>
  );

  return (
    <Dialog.Root
      open={aberto}
      onOpenChange={(abrir, detalhes) => {
        if (abrir) return;
        // Controlado: quem fecha é o `fechar`, que antes pergunta se há alteração.
        detalhes.cancel();
        fechar();
      }}
      onOpenChangeComplete={(abriu) => {
        if (!abriu && fechando.current) onFechar();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="bg-foreground/40 fixed inset-0 z-50 transition-opacity duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          ref={popup}
          // No toque, o Base UI foca o próprio diálogo, para o teclado virtual não cobrir a folha.
          initialFocus={(tipo) =>
            tipo === 'touch' ? true : (popup.current?.querySelector<HTMLElement>(CAMPO) ?? true)
          }
          className="bg-popover text-popover-foreground fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] origin-bottom flex-col rounded-t-xl shadow-xl transition-[opacity,scale] duration-150 ease-out outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[calc(100dvh-64px)] sm:w-[480px] sm:max-w-[calc(100vw-32px)] sm:origin-center sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
        >
          <div className="flex flex-none flex-col gap-1 px-6 pt-6 pb-4">
            <Dialog.Title className="text-lg font-semibold">{titulo}</Dialog.Title>
            {descricao && (
              <Dialog.Description className="text-muted-foreground leading-relaxed">
                {descricao}
              </Dialog.Description>
            )}
          </div>
          <PedirFechamento value={fechar}>
            {onEnviar ? (
              <form
                noValidate
                onSubmit={(evento) => {
                  evento.preventDefault();
                  onEnviar();
                }}
                className="flex min-h-0 flex-col"
              >
                {corpo}
              </form>
            ) : (
              corpo
            )}
          </PedirFechamento>
          {confirmacao}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
