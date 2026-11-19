import { Button } from '@base-ui/react/button';
import { SidebarSimple, SignOut } from '@phosphor-icons/react';
import { Link, useRouterState } from '@tanstack/react-router';

import type { SessaoAtualDto } from '../../gen/types/SessaoAtualDto';
import { cn } from '../../lib/cn';
import { filtrarPorPermissao, pode } from '../../lib/permissoes';
import { Avatar } from '../avatar/Avatar';
import { Dica } from '../dica/Dica';
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
  const nomesDosPapeis = sessao.papeis.map((papel) => papel.nome).join(', ');
  const destinos = [...permitidos.flatMap((g) => g.itens), ...rodapePermitido].map((i) => i.to);

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
          <Dica rotulo={recolhido ? 'Expandir menu' : 'Recolher menu'}>
            <Button
              type="button"
              onClick={onAlternar}
              aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
              aria-expanded={!recolhido}
              className={botaoIcone}
            >
              <SidebarSimple size={20} aria-hidden />
            </Button>
          </Dica>
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
              <ItemDoMenu key={item.nome} item={item} recolhido={recolhido} destinos={destinos} />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-sidebar-border flex flex-col gap-0.5 border-t pt-2">
        {rodapePermitido.map((item) => (
          <ItemDoMenu key={item.nome} item={item} recolhido={recolhido} destinos={destinos} />
        ))}
        <div
          className={cn(
            'flex items-center gap-2.5',
            recolhido ? 'flex-col py-2' : 'h-12 pr-1 pl-1.5',
          )}
        >
          <Dica rotulo={`${sessao.usuario.nome} (${nomesDosPapeis})`} desativada={!recolhido}>
            <span className="flex">
              <Avatar
                nome={sessao.usuario.nome}
                tamanho="sm"
                className="bg-sidebar-avatar text-sidebar-accent-foreground"
              />
            </span>
          </Dica>
          {!recolhido && (
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="text-sidebar-primary truncate text-[13px] font-semibold">
                {sessao.usuario.nome}
              </span>
              <span className="text-sidebar-muted truncate text-xs">{nomesDosPapeis}</span>
            </span>
          )}
          <Dica rotulo="Sair do One">
            <Button
              type="button"
              onClick={onSair}
              disabled={saindo}
              aria-label="Sair do One"
              className={botaoIcone}
            >
              <SignOut size={18} aria-hidden />
            </Button>
          </Dica>
        </div>
      </div>
    </div>
  );
}

/** Na tela de um destino abaixo do item (Ausências em /escala/ausencias), o item (Escala) sai de ativo. */
function temFilhoAtivo(to: string, destinos: string[], caminho: string) {
  return destinos.some(
    (outro) =>
      outro !== to &&
      outro.startsWith(`${to}/`) &&
      (caminho === outro || caminho.startsWith(`${outro}/`)),
  );
}

function ItemDoMenu({
  item,
  recolhido,
  destinos,
}: {
  item: ItemMenu;
  recolhido: boolean;
  destinos: string[];
}) {
  const caminho = useRouterState({ select: (s) => s.location.pathname });
  const Icone = item.icone;
  const contador = item.contador ?? 0;
  const nomeAcessivel =
    contador > 0
      ? `${item.nome}, ${contador} ${contador === 1 ? 'pendente' : 'pendentes'}`
      : undefined;

  return (
    <Dica rotulo={item.nome} desativada={!recolhido}>
      <Link
        to={item.to}
        activeOptions={{ exact: temFilhoAtivo(item.to, destinos, caminho) }}
        aria-label={nomeAcessivel ?? (recolhido ? item.nome : undefined)}
        className={cn(
          'group text-sidebar-foreground flex h-9 items-center gap-2.5 rounded-md px-2.5 font-medium',
          'hover:bg-sidebar-hover hover:text-sidebar-accent-foreground',
          'focus-visible:outline-sidebar-ring focus-visible:outline-2',
          'data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground data-[status=active]:font-semibold',
          recolhido && 'justify-center px-0',
        )}
      >
        <span className="relative flex-none">
          <Icone
            size={20}
            aria-hidden
            className="text-sidebar-icon group-hover:text-sidebar-accent-foreground group-data-[status=active]:text-sidebar-accent-foreground"
          />
          {recolhido && contador > 0 && (
            <span
              aria-hidden
              className="bg-sidebar-avatar ring-sidebar absolute -top-1 -right-1.5 size-2.5 rounded-full ring-2"
            />
          )}
        </span>
        {!recolhido && <span className="flex-1 truncate">{item.nome}</span>}
        {!recolhido && contador > 0 && (
          <span
            aria-hidden
            className="bg-sidebar-accent text-sidebar-accent-foreground group-data-[status=active]:bg-sidebar-avatar min-w-6 rounded-full px-1.5 text-center text-xs leading-5 font-semibold tabular-nums"
          >
            {contador > 999 ? '999+' : contador}
          </span>
        )}
      </Link>
    </Dica>
  );
}
