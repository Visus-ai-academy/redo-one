import { CaretLeft } from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { filtrarPorPermissao } from '../../lib/permissoes';
import { GRUPOS_CONFIGURACOES, type GrupoConfiguracoes } from './itens';

type ConfiguracoesLayoutProps = {
  acesso: { acessoTotal: boolean; permissoes: readonly string[] };
  children: ReactNode;
  grupos?: GrupoConfiguracoes[];
};

/** Subtela de Configurações: submenu por assunto à esquerda (acima no celular) e o conteúdo. */
export function ConfiguracoesLayout({
  acesso,
  children,
  grupos = GRUPOS_CONFIGURACOES,
}: ConfiguracoesLayoutProps) {
  const permitidos = filtrarPorPermissao(grupos, acesso);

  return (
    <div className="flex flex-wrap content-start gap-8">
      <nav
        aria-label="Configurações"
        className="flex max-w-full flex-[1_1_184px] flex-col gap-4 lg:max-w-[220px]"
      >
        <Link
          to="/configuracoes"
          aria-label="Voltar para Configurações"
          className="text-foreground hover:text-primary focus-visible:outline-ring inline-flex h-8 items-center gap-1.5 self-start rounded-md font-semibold focus-visible:outline-2"
        >
          <CaretLeft size={16} aria-hidden className="text-subtle-foreground" />
          Configurações
        </Link>
        {permitidos.map((grupo) => (
          // No celular fica só o "‹ Configurações": a central já lista tudo.
          <div key={grupo.titulo} className="hidden flex-col gap-0.5 md:flex">
            <span className="text-foreground px-2 pb-1 text-xs font-semibold">{grupo.titulo}</span>
            {grupo.itens.map((item) => (
              <Link
                key={item.nome}
                to={item.to}
                hash={item.hash}
                activeOptions={{ includeHash: true, exact: true }}
                className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-ring data-[status=active]:bg-accent data-[status=active]:text-accent-foreground flex h-8 items-center rounded-md px-2 focus-visible:outline-2 data-[status=active]:font-medium"
              >
                {item.nome}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-5">{children}</div>
    </div>
  );
}
