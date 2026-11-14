import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';

import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { SemPermissao } from '../../../components/estado/estados';
import { type FiltrosUsuarios, ListaUsuarios } from '../../../components/usuarios/ListaUsuarios';
import { usuariosControllerListarQueryOptions } from '../../../gen/hooks/useUsuariosControllerListar';
import { usuariosControllerPapeisQueryOptions } from '../../../gen/hooks/useUsuariosControllerPapeis';
import { pode } from '../../../lib/permissoes';

const POR_PAGINA = 25;

// Filtros e página ficam na URL: dá para voltar, recarregar e mandar o link. Valor inválido vira
// "sem filtro" em vez de erro.
const buscaSchema = z.object({
  busca: z.string().trim().min(1).optional().catch(undefined),
  papelId: z.uuid().optional().catch(undefined),
  situacao: z
    .enum(['ativo', 'convite_pendente', 'bloqueado', 'desativado'])
    .optional()
    .catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
});

const consultaDaLista = (filtros: z.infer<typeof buscaSchema>) => ({
  query: { ...filtros, pagina: filtros.pagina ?? 1, porPagina: POR_PAGINA },
});

export const Route = createFileRoute('/_app/configuracoes/usuarios')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'usuarios.ver')) return;
    await Promise.all([
      context.queryClient.ensureQueryData(
        usuariosControllerListarQueryOptions(consultaDaLista(deps)),
      ),
      context.queryClient.ensureQueryData(usuariosControllerPapeisQueryOptions()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Usuários | One' }] }),
  component: PaginaUsuarios,
});

function PaginaUsuarios() {
  const { sessao } = Route.useRouteContext();

  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'usuarios.ver') ? (
        <Usuarios euId={sessao.usuario.id} />
      ) : (
        <SemPermissao tela="Usuários" />
      )}
    </ConfiguracoesLayout>
  );
}

function Usuarios({ euId }: { euId: string }) {
  const filtros = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: pagina } = useSuspenseQuery(
    usuariosControllerListarQueryOptions(consultaDaLista(filtros)),
  );
  const { data: papeis } = useSuspenseQuery(usuariosControllerPapeisQueryOptions());

  // Filtro novo volta para a página 1.
  const filtrar = useCallback(
    (novos: Partial<FiltrosUsuarios>) =>
      void navigate({
        search: (atual) => ({ ...atual, ...novos, pagina: undefined }),
        replace: true,
      }),
    [navigate],
  );
  const irPara = useCallback(
    (numero: number) => void navigate({ search: (atual) => ({ ...atual, pagina: numero }) }),
    [navigate],
  );

  return (
    <ListaUsuarios
      pagina={pagina}
      filtros={filtros}
      papeis={papeis}
      euId={euId}
      onFiltrar={filtrar}
      onIrPara={irPara}
    />
  );
}
