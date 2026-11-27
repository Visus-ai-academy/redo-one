import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';

import { SemPermissao } from '../../components/estado/estados';
import { apiDoTipo, opcoesDeApoio } from '../../components/financeiro/titulos/api';
import {
  type BuscaTitulos,
  buscaTitulosSchema,
  consultaDeTitulos,
} from '../../components/financeiro/titulos/busca';
import { ListaTitulos } from '../../components/financeiro/titulos/ListaTitulos';
import { pode } from '../../lib/permissoes';
import { diaDeHoje } from '../../lib/titulos';

const TIPO = 'pagar' as const;
const TELA = 'contas-pagar';

export const Route = createFileRoute('/_app/contas-pagar')({
  validateSearch: buscaTitulosSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    if (!pode(context.sessao, `${TELA}.ver`)) return;
    const api = apiDoTipo(TIPO);
    // O item vem depois: o painel abre na hora, com o skeleton, enquanto ele carrega.
    if (deps.id) void context.queryClient.prefetchQuery(api.obter({ path: { id: deps.id } }));
    const apoio = opcoesDeApoio(TIPO);
    await Promise.all([
      cause !== 'stay' &&
        context.queryClient.ensureQueryData(api.listar(consultaDeTitulos(deps, diaDeHoje()))),
      context.queryClient.ensureQueryData(apoio.empresas),
      context.queryClient.ensureQueryData(apoio.categorias),
      context.queryClient.ensureQueryData(apoio.contas),
    ]);
  },
  head: () => ({ meta: [{ title: 'Contas a pagar · One' }] }),
  component: PaginaContasPagar,
});

function PaginaContasPagar() {
  const { sessao } = Route.useRouteContext();
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const ir = useCallback(
    (mudar: (atual: BuscaTitulos) => BuscaTitulos, replace = false) =>
      void navigate({ search: mudar, replace }),
    [navigate],
  );
  if (!pode(sessao, `${TELA}.ver`)) return <SemPermissao tela="Contas a pagar" />;
  return <ListaTitulos tipo={TIPO} busca={busca} ir={ir} acesso={sessao} />;
}
