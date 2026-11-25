import { Drawer } from '@base-ui/react/drawer';
import { X } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { cn } from '../../lib/cn';
import { buttonClassName } from '../button/button-class';
import { CamadaDeAlterados } from './CamadaDeAlterados';
import { PedirFechamento, useColetorDeAlterados, useDescartarAlteracoes } from './fechamento';

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
  /**
   * Formulário com alterações não salvas (`useAlterado(form)`): fechar pelo X, Esc, arrastar ou
   * pelo `BotaoCancelar` pergunta antes "Descartar as alterações?". Formulário de dentro (ex.: o
   * de uma aba) avisa sozinho com `useInformarAlterado`, sem passar por aqui.
   */
  alterado?: boolean;
  children: ReactNode;
};

// Painéis montados agora. Trocar de linha remonta o painel (outra `key`) com o anterior ainda na
// tela: aí o novo aparece no lugar, sem deslizar de novo.
let montados = 0;

/**
 * Painel de ver ou editar um item (detalhe, edição), sobre o Drawer do Base UI. Sempre por cima:
 * nunca encolhe a tela; o resto ganha um fundo com desfoque mínimo e um véu bem leve que não deixa
 * clicar atrás. Modal: o foco fica preso no painel e volta para quem abriu ao fechar. Fecha pelo X,
 * pelo Esc, arrastando para a direita, clicando fora ou pelo `BotaoCancelar` do formulário; com
 * `alterado`, pergunta antes de descartar. No computador ocupa 400px à direita (720px no largo);
 * abaixo de `lg`, a tela inteira. Entra e sai deslizando; quem usa só fica sabendo do fechamento
 * (`onFechar`) depois que ele saiu. Os avisos (toast) ficam por cima do fundo e clicáveis.
 *
 * Painel ou diálogo: o painel é para ver ou editar um item de uma lista (pode ter abas, histórico,
 * listas). Tarefa curta e atômica (criar algo simples, convidar, informar um motivo) vai no
 * `Dialogo`.
 */
export function PainelLateral({
  titulo,
  subtitulo,
  inicio,
  onFechar,
  ocupado,
  largura = 'padrao',
  alterado = false,
  children,
}: PainelLateralProps) {
  // Monta fechado e abre em seguida: o Base UI só anima a entrada quando `open` muda.
  const [aberto, setAberto] = useState(() => montados > 0);
  const fechando = useRef(false);
  const { pedir, confirmacao } = useDescartarAlteracoes();
  const coletor = useColetorDeAlterados();
  const comAlteracao = alterado || coletor.alterado;
  const fechar = () =>
    pedir(comAlteracao, () => {
      fechando.current = true;
      setAberto(false);
    });

  // Recarregar ou fechar a guia do navegador com algo digitado: o navegador pergunta antes.
  useEffect(() => {
    if (!comAlteracao) return;
    const perguntar = (evento: BeforeUnloadEvent) => evento.preventDefault();
    window.addEventListener('beforeunload', perguntar);
    return () => window.removeEventListener('beforeunload', perguntar);
  }, [comAlteracao]);

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
      onOpenChange={(abrir, detalhes) => {
        if (abrir) return;
        // O aviso (toast) fica por cima do fundo: fechar o aviso não fecha o painel.
        if (
          detalhes.reason === 'outside-press' &&
          detalhes.event.target instanceof Element &&
          detalhes.event.target.closest('.faixa-avisos')
        ) {
          detalhes.cancel();
          return;
        }
        // Controlado: quem fecha é o `fechar`, que antes pergunta se há alteração.
        detalhes.cancel();
        fechar();
      }}
      onOpenChangeComplete={(abriu) => {
        if (!abriu && fechando.current) onFechar();
      }}
      swipeDirection="right"
    >
      <Drawer.Portal>
        {/* Véu de 4% do texto, sem desfoque: só a opacidade anima, a cor não. */}
        <Drawer.Backdrop
          data-fundo-painel
          className="bg-foreground/[0.04] fixed inset-0 z-40 transition-opacity duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none"
        />
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
            <Drawer.Content className="flex flex-col">
              <CamadaDeAlterados registrar={coletor.registrar}>
                <PedirFechamento value={fechar}>{children}</PedirFechamento>
              </CamadaDeAlterados>
            </Drawer.Content>
            {confirmacao}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
