import { CaretRight } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';

import { Alerta } from '../../../components/alerta/Alerta';
import { SemPermissao } from '../../../components/estado/estados';
import { buscarMedicos } from '../../../components/rodada/buscas';
import { DetalheRodada } from '../../../components/rodada/DetalheRodada';
import { Skeleton } from '../../../components/skeleton/Skeleton';
import { rodadasControllerFilaQueryOptions } from '../../../gen/hooks/useRodadasControllerFila';
import { rodadasControllerObterQueryOptions } from '../../../gen/hooks/useRodadasControllerObter';
import { rodadasControllerResumoQueryOptions } from '../../../gen/hooks/useRodadasControllerResumo';
import { pode } from '../../../lib/permissoes';
import { intervaloDaRodada, tituloDaRodada } from '../../../lib/rodada';

export const Route = createFileRoute('/_app/distribuicao/rodadas/$id')({
  loader: async ({ context, params }) => {
    if (!pode(context.sessao, 'distribuicao.ver')) return;
    void context.queryClient.prefetchQuery(
      rodadasControllerResumoQueryOptions({ path: { id: params.id } }),
    );
    await context.queryClient.ensureQueryData(
      rodadasControllerObterQueryOptions({ path: { id: params.id } }),
    );
  },
  head: () => ({ meta: [{ title: 'Rodada da distribuição | One' }] }),
  component: PaginaRodada,
});

function PaginaRodada() {
  const { sessao } = Route.useRouteContext();
  if (!pode(sessao, 'distribuicao.ver')) return <SemPermissao tela="Distribuição" />;
  return <Rodada />;
}

function Rodada() {
  const { id } = Route.useParams();
  const rodada = useQuery({
    ...rodadasControllerObterQueryOptions({ path: { id } }),
    refetchInterval: (q) => intervaloDaRodada(q.state.data?.status),
    refetchIntervalInBackground: false,
  });
  const resumo = useQuery({
    ...rodadasControllerResumoQueryOptions({ path: { id } }),
    enabled: Boolean(rodada.data?.lidaEm),
    refetchInterval: intervaloDaRodada(rodada.data?.status),
    refetchIntervalInBackground: false,
  });
  // Nomes dos turnos, frentes e prioridades de hoje, para os recortes.
  const fila = useQuery({ ...rodadasControllerFilaQueryOptions(), staleTime: 60_000 });
  const nomes = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of fila.data?.turnos ?? []) m.set(t.turnoId, t.nome);
    for (const f of fila.data?.porFrente ?? []) if (f.frenteId) m.set(f.frenteId, f.nome);
    for (const p of fila.data?.prioridades ?? [])
      if (p.prioridadeOperacaoId) m.set(p.prioridadeOperacaoId, p.nome);
    for (const x of resumo.data?.medicos ?? []) m.set(x.medicoId, x.nome);
    return m;
  }, [fila.data, resumo.data]);

  const caminho = (
    <nav
      aria-label="Caminho"
      className="text-muted-foreground flex flex-wrap items-center gap-1 text-[13px]"
    >
      <Link to="/distribuicao" className="hover:text-foreground underline-offset-2 hover:underline">
        Distribuição
      </Link>
      <CaretRight size={12} aria-hidden />
      <Link
        to="/distribuicao"
        search={{ aba: 'historico' }}
        className="hover:text-foreground underline-offset-2 hover:underline"
      >
        Histórico
      </Link>
      <CaretRight size={12} aria-hidden />
      <span aria-current="page">
        {rodada.data ? tituloDaRodada(rodada.data.criadoEm) : 'Rodada'}
      </span>
    </nav>
  );

  if (!rodada.data) {
    return rodada.isError ? (
      <div className="flex flex-col gap-4">
        {caminho}
        <Alerta tom="erro">
          Não foi possível carregar a rodada. Confira o link e tente de novo.
        </Alerta>
      </div>
    ) : (
      <div className="flex flex-col gap-4" aria-busy>
        {caminho}
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  return (
    <DetalheRodada
      rodada={rodada.data}
      resumo={resumo.data}
      nomes={nomes}
      caminho={caminho}
      buscarMedicos={buscarMedicos}
    />
  );
}
