import { Drawer } from '@base-ui/react/drawer';
import { List } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';

import { useSessaoControllerSair } from '../../gen/hooks/useSessaoControllerSair';
import type { SessaoAtualDto } from '../../gen/types/SessaoAtualDto';
import { cn } from '../../lib/cn';
import { MenuLateral } from './MenuLateral';
import { GRUPOS_MENU, type GrupoMenu, type ItemMenu, RODAPE_MENU } from './menu';

const CHAVE_RECOLHIDO = 'one:menu-recolhido';

type AppShellProps = {
  sessao: SessaoAtualDto;
  children: ReactNode;
  grupos?: GrupoMenu[];
  rodape?: ItemMenu[];
};

/** Layout das telas autenticadas: menu verde à esquerda (gaveta no celular) e o conteúdo. */
export function AppShell({
  sessao,
  children,
  grupos = GRUPOS_MENU,
  rodape = RODAPE_MENU,
}: AppShellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sair = useSessaoControllerSair();
  const [recolhido, setRecolhido] = useState(false);
  const [gavetaAberta, setGavetaAberta] = useState(false);

  // Preferência por navegador; lida depois da hidratação para o SSR e o cliente renderizarem igual.
  useEffect(() => {
    try {
      setRecolhido(localStorage.getItem(CHAVE_RECOLHIDO) === '1');
    } catch {
      // Storage indisponível: o menu começa aberto.
    }
  }, []);

  const alternar = () => {
    setRecolhido((atual) => {
      try {
        localStorage.setItem(CHAVE_RECOLHIDO, atual ? '0' : '1');
      } catch {
        // Storage indisponível: a escolha vale só nesta aba.
      }
      return !atual;
    });
  };

  const sairDoOne = async () => {
    try {
      await sair.mutateAsync(undefined);
    } finally {
      // Mesmo se a API falhar, o navegador esquece tudo o que sabia da sessão.
      queryClient.clear();
      await navigate({ to: '/login', replace: true });
    }
  };

  const menu = (props: { recolhido: boolean; onAlternar?: () => void }) => (
    <MenuLateral
      sessao={sessao}
      grupos={grupos}
      rodape={rodape}
      onSair={() => void sairDoOne()}
      saindo={sair.isPending}
      {...props}
    />
  );

  return (
    <div className="bg-background flex min-h-dvh flex-col md:flex-row">
      <header className="bg-sidebar sticky top-0 z-10 flex h-14 items-center gap-2 px-2 md:hidden">
        <Drawer.Root open={gavetaAberta} onOpenChange={setGavetaAberta} swipeDirection="left">
          <Drawer.Trigger
            aria-label="Abrir menu"
            className="text-sidebar-foreground hover:bg-sidebar-hover focus-visible:outline-sidebar-ring flex size-11 items-center justify-center rounded-md focus-visible:outline-2"
          >
            <List size={20} aria-hidden />
          </Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Backdrop className="bg-foreground/40 fixed inset-0 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
            <Drawer.Viewport className="fixed inset-0 flex justify-start">
              <Drawer.Popup
                aria-label="Menu"
                className="h-dvh w-[280px] max-w-[85vw] [transform:translateX(var(--drawer-swipe-movement-x))] shadow-xl transition-transform duration-200 ease-out outline-none data-[ending-style]:[transform:translateX(-100%)] data-[starting-style]:[transform:translateX(-100%)] data-[swiping]:select-none motion-reduce:transition-none"
              >
                <Drawer.Title className="sr-only">Menu</Drawer.Title>
                {/* Fecha a gaveta ao escolher um item. */}
                <div
                  className="h-full"
                  onClickCapture={(e) =>
                    (e.target as HTMLElement).closest('a') && setGavetaAberta(false)
                  }
                >
                  {menu({ recolhido: false })}
                </div>
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
        <span className="font-brand text-sidebar-primary text-lg font-bold tracking-[0.14em]">
          One
        </span>
      </header>

      <aside
        className={cn(
          'sticky top-0 hidden h-dvh flex-none transition-[width] duration-200 ease-out motion-reduce:transition-none md:block',
          recolhido ? 'w-16' : 'w-60',
        )}
      >
        {menu({ recolhido, onAlternar: alternar })}
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
