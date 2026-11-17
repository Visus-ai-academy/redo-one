import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';

import { buscarMedicosDoHistorico } from '../../../components/escala-historico/buscar-medicos';
import {
  type FiltrosHistorico,
  HistoricoEscala,
} from '../../../components/escala-historico/HistoricoEscala';
import { SemPermissao } from '../../../components/estado/estados';
import { historicoEscalaControllerListarQueryOptions } from '../../../gen/hooks/useHistoricoEscalaControllerListar';
import { useMedicosControllerObter } from '../../../gen/hooks/useMedicosControllerObter';
import { entidadeEscala } from '../../../gen/types/EntidadeEscala';
import { pode } from '../../../lib/permissoes';

const POR_PAGINA = 25;
const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const buscaSchema = z.object({
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  medicoId: z.uuid().optional().catch(undefined),
  entidade: z.enum(entidadeEscala).optional().catch(undefined),
  de: DIA.optional().catch(undefined),
  ate: DIA.optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const consulta = ({ pagina, ...filtros }: Busca) => {
  // Período invertido vindo de um link: a API recusa; vale só o início.
  const ate = filtros.de && filtros.ate && filtros.ate < filtros.de ? undefined : filtros.ate;
  return { query: { ...filtros, ate, pagina: pagina ?? 1, porPagina: POR_PAGINA } };
};

export const Route = createFileRoute('/_app/escala/historico')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'escala-historico.ver')) return;
    await context.queryClient.ensureQueryData(
      historicoEscalaControllerListarQueryOptions(consulta(deps)),
    );
  },
  head: () => ({ meta: [{ title: 'Histórico da escala | One' }] }),
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return pode(sessao, 'escala-historico.ver') ? (
    <Historico podeBuscarMedicos={pode(sessao, 'medicos.ver')} />
  ) : (
    <SemPermissao tela="Histórico da escala" />
  );
}

function Historico({ podeBuscarMedicos }: { podeBuscarMedicos: boolean }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: pagina } = useSuspenseQuery(
    historicoEscalaControllerListarQueryOptions(consulta(busca)),
  );

  // O nome do médico do filtro: das linhas da página ou, se não estiver nela, do cadastro.
  const naPagina = pagina.itens.find((i) => i.medico?.id === busca.medicoId)?.medico;
  const cadastro = useMedicosControllerObter(
    { path: { id: busca.medicoId ?? '' } },
    { query: { enabled: Boolean(busca.medicoId && !naPagina && podeBuscarMedicos) } },
  );
  const nome = naPagina?.nome ?? cadastro.data?.nome;
  const medico = busca.medicoId && nome ? { valor: busca.medicoId, rotulo: nome } : null;

  // Filtro novo volta para a página 1.
  const filtrar = useCallback(
    (novos: Partial<FiltrosHistorico>) =>
      void navigate({
        search: (atual) => ({ ...atual, ...novos, pagina: undefined }),
        replace: true,
      }),
    [navigate],
  );

  return (
    <HistoricoEscala
      pagina={pagina}
      filtros={busca}
      medico={medico}
      buscarMedicos={podeBuscarMedicos ? buscarMedicosDoHistorico : undefined}
      onFiltrar={filtrar}
      onLimparFiltros={() => void navigate({ search: {}, replace: true })}
      onIrPara={(numero) => void navigate({ search: (atual) => ({ ...atual, pagina: numero }) })}
    />
  );
}
