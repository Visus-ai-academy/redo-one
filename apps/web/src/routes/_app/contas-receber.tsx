import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';

import { Abas } from '../../components/abas/Abas';
import { SemPermissao } from '../../components/estado/estados';
import {
  apiDeRecorrencias,
  apiDoTipo,
  opcoesDeApoio,
} from '../../components/financeiro/titulos/api';
import {
  type BuscaTitulos,
  buscaTitulosSchema,
  consultaDaInadimplencia,
  consultaDeRecorrencias,
  consultaDeTitulos,
} from '../../components/financeiro/titulos/busca';
import { ListaInadimplencia } from '../../components/financeiro/titulos/ListaInadimplencia';
import { ListaRecorrencias } from '../../components/financeiro/titulos/ListaRecorrencias';
import { ListaTitulos } from '../../components/financeiro/titulos/ListaTitulos';
import { inadimplenciaControllerListarQueryOptions } from '../../gen/hooks/useInadimplenciaControllerListar';
import { pode } from '../../lib/permissoes';
import { diaDeHoje } from '../../lib/titulos';

const TIPO = 'receber' as const;
const TELA = 'contas-receber';
const ABAS = [
  { valor: 'titulos', rotulo: 'Títulos' },
  { valor: 'recorrentes', rotulo: 'Recorrentes' },
  { valor: 'inadimplencia', rotulo: 'Inadimplência' },
];

export const Route = createFileRoute('/_app/contas-receber')({
  validateSearch: buscaTitulosSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    if (!pode(context.sessao, `${TELA}.ver`)) return;
    const api = apiDoTipo(TIPO);
    const apoio = opcoesDeApoio(TIPO);
    if (deps.aba === 'recorrentes') {
      if (deps.id)
        void context.queryClient.prefetchQuery(
          apiDeRecorrencias(TIPO).obter({ path: { id: deps.id } }),
        );
      await Promise.all([
        cause !== 'stay' &&
          context.queryClient.ensureQueryData(
            apiDeRecorrencias(TIPO).listar(consultaDeRecorrencias(deps)),
          ),
        context.queryClient.ensureQueryData(apoio.empresas),
      ]);
      return;
    }
    if (deps.aba === 'inadimplencia') {
      await Promise.all([
        cause !== 'stay' &&
          context.queryClient.ensureQueryData(
            inadimplenciaControllerListarQueryOptions(consultaDaInadimplencia(deps)),
          ),
        context.queryClient.ensureQueryData(apoio.empresas),
      ]);
      return;
    }
    // O item vem depois: o painel abre na hora, com o skeleton, enquanto ele carrega.
    if (deps.id) void context.queryClient.prefetchQuery(api.obter({ path: { id: deps.id } }));
    await Promise.all([
      cause !== 'stay' &&
        context.queryClient.ensureQueryData(api.listar(consultaDeTitulos(deps, diaDeHoje()))),
      context.queryClient.ensureQueryData(apoio.empresas),
      context.queryClient.ensureQueryData(apoio.categorias),
      context.queryClient.ensureQueryData(apoio.contas),
    ]);
  },
  head: () => ({ meta: [{ title: 'Contas a receber · One' }] }),
  component: PaginaContasReceber,
});

function PaginaContasReceber() {
  const { sessao } = Route.useRouteContext();
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const ir = useCallback(
    (mudar: (atual: BuscaTitulos) => BuscaTitulos, replace = false) =>
      void navigate({ search: mudar, replace }),
    [navigate],
  );
  if (!pode(sessao, `${TELA}.ver`)) return <SemPermissao tela="Contas a receber" />;
  const aba = busca.aba ?? 'titulos';
  const abas = (
    <Abas
      aria-label="Partes de Contas a receber"
      valor={aba}
      // Trocar de aba começa do zero: os filtros de uma não valem na outra.
      onMudar={(valor) =>
        ir(() => ({ aba: valor === 'titulos' ? undefined : (valor as BuscaTitulos['aba']) }))
      }
      abas={ABAS}
    />
  );
  if (aba === 'recorrentes') {
    return <ListaRecorrencias tipo={TIPO} busca={busca} ir={ir} acesso={sessao} abas={abas} />;
  }
  if (aba === 'inadimplencia') {
    // Sem ação de criar: a aba só lista quem está em atraso.
    return <ListaInadimplencia busca={busca} ir={ir} abas={abas} />;
  }
  return <ListaTitulos tipo={TIPO} busca={busca} ir={ir} acesso={sessao} abas={abas} />;
}
