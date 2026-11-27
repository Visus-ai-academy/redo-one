import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';

import { SemPermissao } from '../../../components/estado/estados';
import {
  type BuscaDistribuicao,
  TelaDistribuicao,
} from '../../../components/rodada/TelaDistribuicao';
import { rodadasControllerVivaQueryOptions } from '../../../gen/hooks/useRodadasControllerViva';
import { pode } from '../../../lib/permissoes';

const STATUS = [
  'solicitada',
  'lendo',
  'aguardando_aprovacao',
  'aprovada',
  'executando',
  'pausada',
  'parcial',
  'concluida',
  'expirada',
  'cancelada',
  'falhou',
] as const;

const buscaSchema = z.object({
  aba: z.literal('historico').optional().catch(undefined),
  distribuir: z.literal(1).optional().catch(undefined),
  visao: z.enum(['fora', 'medicos-fora']).optional().catch(undefined),
  motivo: z.string().max(60).optional().catch(undefined),
  status: z.enum(STATUS).optional().catch(undefined),
  periodo: z.literal('todas').optional().catch(undefined),
  de: z.iso.date().optional().catch(undefined),
  ate: z.iso.date().optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
});

export const Route = createFileRoute('/_app/distribuicao/')({
  validateSearch: buscaSchema,
  loader: async ({ context }) => {
    if (!pode(context.sessao, 'distribuicao.ver')) return;
    await context.queryClient.ensureQueryData(rodadasControllerVivaQueryOptions());
  },
  head: () => ({ meta: [{ title: 'Distribuição | One' }] }),
  component: PaginaDistribuicao,
});

function PaginaDistribuicao() {
  const { sessao } = Route.useRouteContext();
  const busca = Route.useSearch() as BuscaDistribuicao;
  const navigate = Route.useNavigate();
  const onBusca = useCallback(
    (mudar: (atual: BuscaDistribuicao) => BuscaDistribuicao, replace = false) =>
      void navigate({ search: (a) => mudar(a as BuscaDistribuicao), replace }),
    [navigate],
  );
  const abrirRodada = useCallback(
    (id: string) => void navigate({ to: '/distribuicao/rodadas/$id', params: { id } }),
    [navigate],
  );
  if (!pode(sessao, 'distribuicao.ver')) return <SemPermissao tela="Distribuição" />;
  return (
    <TelaDistribuicao sessao={sessao} busca={busca} onBusca={onBusca} onAbrirRodada={abrirRodada} />
  );
}
