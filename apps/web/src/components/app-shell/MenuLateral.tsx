import { SidebarSimple, SignOut } from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';

import type { SessaoAtualDto } from '../../gen/types/SessaoAtualDto';
import { cn } from '../../lib/cn';
import { filtrarPorPermissao, pode } from '../../lib/permissoes';
import { iniciais } from './iniciais';
import type { GrupoMenu, ItemMenu } from './menu';

type MenuLateralProps = {
  sessao: SessaoAtualDto;
  grupos: GrupoMenu[];
  rodape: ItemMenu[];
  recolhido: boolean;
  /** Ausente na gaveta do celular, que não recolhe. */
  onAlternar?: () => void;
  onSair: () => void;
  saindo: boolean;
};

const botaoIcone =
  'flex size-9 flex-none items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-sidebar-ring disabled:opacity-60';

export function MenuLateral({
  sessao,
  grupos,
  rodape,
  recolhido,
  onAlternar,
  onSair,
  saindo,
}: MenuLateralProps) {
  const permitidos = filtrarPorPermissao(grupos, sessao);
  const rodapePermitido = rodape.filter((item) => pode(sessao, item.permissao));

  return (
    <div className="bg-sidebar text-sidebar-foreground flex h-full flex-col gap-1 p-3">
      <div
        className={cn(
          'flex h-10 items-center',
          recolhido ? 'justify-center' : 'justify-between pl-2.5',
        )}
      >
        {!recolhido && (
          <span className="font-brand text-sidebar-primary text-lg font-bold tracking-[0.14em]">
            One
          </span>
        )}
        {onAlternar && (
          <button
            type="button"
            onClick={onAlternar}
            aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
            aria-expanded={!recolhido}
            className={botaoIcone}
          >
            <SidebarSimple size={20} aria-hidden />
          </button>
        )}
      </div>

      <nav aria-label="Menu principal" className="flex flex-1 flex-col overflow-y-auto">
        {permitidos.map((grupo) => (
          <div key={grupo.titulo} className="flex flex-col gap-0.5 pt-4">
            {!recolhido && (
              <span className="text-sidebar-muted px-2.5 pb-1 text-xs font-medium">
                {grupo.titulo}
              </span>
            )}
            {grupo.itens.map((item) => (
              <ItemDoMenu key={item.nome} item={item} recolhido={recolhido} />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-sidebar-border flex flex-col gap-0.5 border-t pt-2">
        {rodapePermitido.map((item) => (
          <ItemDoMenu key={item.nome} item={item} recolhido={recolhido} />
        ))}
        <div
          className={cn(
            'flex items-center gap-2.5',
            recolhido ? 'flex-col py-2' : 'h-12 pr-1 pl-1.5',
          )}
        >
          <span
            aria-hidden="true"
            title={recolhido ? `${sessao.usuario.nome} (${sessao.papel})` : undefined}
            className="bg-sidebar-avatar text-sidebar-accent-foreground flex size-7 flex-none items-center justify-center rounded-full text-xs font-semibold"
          >
            {iniciais(sessao.usuario.nome)}
          </span>
          {!recolhido && (
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="text-sidebar-primary truncate text-[13px] font-semibold">
                {sessao.usuario.nome}
              </span>
              <span className="text-sidebar-muted truncate text-xs">{sessao.papel}</span>
            </span>
          )}
          <button
            type="button"
            onClick={onSair}
            disabled={saindo}
            aria-label="Sair do One"
            title="Sair do One"
            className={botaoIcone}
          >
            <SignOut size={18} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemDoMenu({ item, recolhido }: { item: ItemMenu; recolhido: boolean }) {
  const Icone = item.icone;

  return (
    <Link
      to={item.to}
      title={recolhido ? item.nome : undefined}
      aria-label={recolhido ? item.nome : undefined}
      className={cn(
        'group text-sidebar-foreground flex h-9 items-center gap-2.5 rounded-md px-2.5 font-medium',
        'hover:bg-sidebar-hover hover:text-sidebar-accent-foreground',
        'focus-visible:outline-sidebar-ring focus-visible:outline-2',
        'data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground data-[status=active]:font-semibold',
        recolhido && 'justify-center px-0',
      )}
    >
      <Icone
        size={20}
        aria-hidden
        className="text-sidebar-icon group-hover:text-sidebar-accent-foreground group-data-[status=active]:text-sidebar-accent-foreground flex-none"
      />
      {!recolhido && <span className="flex-1 truncate">{item.nome}</span>}
    </Link>
  );
}
