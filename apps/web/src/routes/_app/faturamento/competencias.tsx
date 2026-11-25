import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { z } from 'zod';

import { EstadoDoErro } from '../../../components/estado/EstadoDoErro';
import { SemPermissao } from '../../../components/estado/estados';
import type { TipoAcaoCompetencia } from '../../../components/faturamento/competencias';
import { ListaCompetencias } from '../../../components/faturamento/ListaCompetencias';
import { competenciasControllerDestravar } from '../../../gen/clients/competenciasControllerDestravar';
import { competenciasControllerFechar } from '../../../gen/clients/competenciasControllerFechar';
import { competenciasControllerReabrir } from '../../../gen/clients/competenciasControllerReabrir';
import { competenciasControllerTravar } from '../../../gen/clients/competenciasControllerTravar';
import {
  competenciasControllerListarQueryKey,
  competenciasControllerListarQueryOptions,
} from '../../../gen/hooks/useCompetenciasControllerListar';
import { pode } from '../../../lib/permissoes';

const POR_PAGINA = 25;

const buscaSchema = z.object({
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const consulta = (b: Busca) => ({ query: { pagina: b.pagina ?? 1, porPagina: POR_PAGINA } });

const CHAMADAS: Record<
  TipoAcaoCompetencia,
  (opcoes: { path: { competencia: string }; body?: { motivoAvisos?: string } }) => {
    unwrap: () => Promise<unknown>;
  }
> = {
  fechar: (opcoes) => competenciasControllerFechar({ ...opcoes, body: opcoes.body ?? {} }),
  reabrir: ({ path }) => competenciasControllerReabrir({ path }),
  travar: ({ path }) => competenciasControllerTravar({ path }),
  destravar: ({ path }) => competenciasControllerDestravar({ path }),
};

export const Route = createFileRoute('/_app/faturamento/competencias')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    if (!pode(context.sessao, 'faturamento.ver')) return;
    // Na própria tela (troca de página), a lista busca sozinha e deixa a de antes à vista.
    if (cause !== 'stay')
      await context.queryClient.ensureQueryData(
        competenciasControllerListarQueryOptions(consulta(deps)),
      );
  },
  head: () => ({ meta: [{ title: 'Competências · One' }] }),
  component: PaginaCompetencias,
  errorComponent: ErroDaTela,
});

function ErroDaTela({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] leading-snug font-semibold">Competências</h1>
      <EstadoDoErro
        erro={error}
        oQue="as competências"
        onTentarDeNovo={() => void router.invalidate()}
        className="p-0"
      />
    </div>
  );
}

function PaginaCompetencias() {
  const { sessao } = Route.useRouteContext();
  return pode(sessao, 'faturamento.ver') ? <Competencias /> : <SemPermissao tela="Competências" />;
}

const PAGINA_VAZIA = { itens: [], total: 0, pagina: 1, porPagina: POR_PAGINA };

function Competencias() {
  const { sessao } = Route.useRouteContext();
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const lista = useQuery({
    ...competenciasControllerListarQueryOptions(consulta(busca)),
    placeholderData: keepPreviousData,
  });

  return (
    <ListaCompetencias
      pagina={lista.data ?? PAGINA_VAZIA}
      acesso={sessao}
      recarregando={lista.isPlaceholderData || !lista.data}
      erro={
        lista.isError && !lista.data
          ? {
              erro: lista.error,
              oQue: 'as competências',
              onTentarDeNovo: () => void lista.refetch(),
            }
          : undefined
      }
      onExecutar={async (tipo, competencia, opcoes) => {
        try {
          await CHAMADAS[tipo]({
            path: { competencia },
            ...(opcoes?.motivoAvisos && { body: { motivoAvisos: opcoes.motivoAvisos } }),
          }).unwrap();
        } finally {
          // Deu certo ou foi recusada (outra pessoa mudou antes): a lista mostra o estado atual.
          await queryClient.invalidateQueries({ queryKey: competenciasControllerListarQueryKey() });
        }
      }}
      onIrPara={(numero) => void navigate({ search: (a) => ({ ...a, pagina: numero }) })}
    />
  );
}
