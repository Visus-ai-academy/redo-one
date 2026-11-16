import { Drawer } from '@base-ui/react/drawer';
import { X } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { cn } from '../../lib/cn';
import { buttonClassName } from '../button/button-class';

type PainelLateralProps = {
  titulo: ReactNode;
  /** Linha abaixo do título (ex.: e-mail da pessoa). */
  subtitulo?: ReactNode;
  /** À esquerda do título (ex.: avatar). */
  inicio?: ReactNode;
  onFechar: () => void;
  /** O conteúdo ainda está carregando (avisa o leitor de tela). */
  ocupado?: boolean;
  /** `larga` (720px no computador) para conteúdo em grade; no celular, sempre a tela inteira. */
  largura?: 'padrao' | 'larga';
  children: ReactNode;
};

// Painéis montados agora. Trocar de linha remonta o painel (outra `key`) com o anterior ainda na
// tela: aí o novo aparece no lugar, sem deslizar de novo.
let montados = 0;

/**
 * Painel ao lado de uma lista (detalhe, convite, edição), sobre o Drawer do Base UI. Não modal:
 * a lista continua à vista e clicável (abrir outra linha troca o painel), e clicar fora não fecha.
 * Fecha pelo X, pelo Esc ou arrastando para a direita. No computador ocupa 400px à direita (a
 * `ListaCadastro` reserva o espaço); abaixo disso, a tela inteira. Entra e sai deslizando; quem usa
 * só fica sabendo do fechamento (`onFechar`) depois que ele saiu.
 */
export function PainelLateral({
  titulo,
  subtitulo,
  inicio,
  onFechar,
  ocupado,
  largura = 'padrao',
  children,
}: PainelLateralProps) {
  // Monta fechado e abre em seguida: o Base UI só anima a entrada quando `open` muda.
  const [aberto, setAberto] = useState(() => montados > 0);
  const fechando = useRef(false);

  useEffect(() => {
    montados += 1;
    setAberto(true);
    return () => {
      montados -= 1;
    };
  }, []);

  return (
    <Drawer.Root
      open={aberto}
      onOpenChange={(abrir) => {
        if (abrir) return;
        fechando.current = true;
        setAberto(false);
      }}
      onOpenChangeComplete={(abriu) => {
        if (!abriu && fechando.current) onFechar();
      }}
      modal={false}
      disablePointerDismissal
      swipeDirection="right"
    >
      <Drawer.Portal>
        <Drawer.Viewport className="pointer-events-none fixed inset-0 z-40 flex justify-end">
          <Drawer.Popup
            data-painel-lateral={largura}
            aria-busy={ocupado || undefined}
            className={cn(
              'bg-card pointer-events-auto flex h-dvh w-full [transform:translateX(var(--drawer-swipe-movement-x))] flex-col overflow-y-auto overscroll-contain shadow-xl transition-transform duration-200 ease-out outline-none data-[ending-style]:[transform:translateX(100%)] data-[starting-style]:[transform:translateX(100%)] data-[swiping]:select-none motion-reduce:transition-none',
              largura === 'larga' ? 'lg:w-[720px]' : 'lg:w-[400px]',
            )}
          >
            <div className="flex flex-none items-center gap-3 border-b p-4">
              {inicio}
              <span className="flex min-w-0 flex-1 flex-col">
                <Drawer.Title className="truncate text-base font-semibold">{titulo}</Drawer.Title>
                {subtitulo && (
                  <Drawer.Description className="text-muted-foreground truncate text-[13px]">
                    {subtitulo}
                  </Drawer.Description>
                )}
              </span>
              <Drawer.Close
                aria-label="Fechar painel"
                className={buttonClassName({
                  variant: 'ghost',
                  className: 'size-9 flex-none px-0',
                })}
              >
                <X size={18} aria-hidden />
              </Drawer.Close>
            </div>
            <Drawer.Content className="flex flex-col">{children}</Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
