import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { AbaComErro } from '../../../components/distribuicao/estados';
import { FormConfiguracaoDistribuicao } from '../../../components/distribuicao/FormConfiguracaoDistribuicao';
import { SemPermissao } from '../../../components/estado/estados';
import { CamposCarregando } from '../../../components/skeleton/CamposCarregando';
import { useAvisos } from '../../../components/toast/use-avisos';
import { configuracaoDistribuicaoControllerSalvar } from '../../../gen/clients/configuracaoDistribuicaoControllerSalvar';
import { configuracaoDistribuicaoControllerObterQueryOptions } from '../../../gen/hooks/useConfiguracaoDistribuicaoControllerObter';
import { opcoesControllerListasQueryOptions } from '../../../gen/hooks/useOpcoesControllerListas';
import { turnosControllerListarQueryOptions } from '../../../gen/hooks/useTurnosControllerListar';
import { pode } from '../../../lib/permissoes';

/** Turnos ativos (são poucos): a escolha dos turnos posteriores. */
const TURNOS = { query: { ativo: true, porPagina: 100 } };

export const Route = createFileRoute('/_app/configuracoes/distribuicao')({
  loader: async ({ context }) => {
    if (!pode(context.sessao, 'distribuicao-config.ver')) return;
    void context.queryClient.prefetchQuery(turnosControllerListarQueryOptions(TURNOS));
    await Promise.all([
      context.queryClient.ensureQueryData(configuracaoDistribuicaoControllerObterQueryOptions()),
      context.queryClient.ensureQueryData(opcoesControllerListasQueryOptions()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Distribuição | Configurações | One' }] }),
  component: PaginaDistribuicao,
});

function PaginaDistribuicao() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'distribuicao-config.ver') ? (
        <Configuracao />
      ) : (
        <SemPermissao tela="Distribuição" />
      )}
    </ConfiguracoesLayout>
  );
}

function Configuracao() {
  const { sessao } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { sucesso } = useAvisos();
  const opcoes = configuracaoDistribuicaoControllerObterQueryOptions();
  const { data: configuracao } = useSuspenseQuery(opcoes);
  const { data: catalogo } = useSuspenseQuery(opcoesControllerListasQueryOptions());
  // Os turnos vêm da escala (`escala.ver`, que a tela exige no catálogo de permissões).
  const turnos = useQuery(turnosControllerListarQueryOptions(TURNOS));

  return (
    <div className="flex max-w-[640px] flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] leading-snug font-semibold">Distribuição</h1>
        <p className="text-muted-foreground">
          O que vale para todas as frentes do robô. A regra de cada frente fica na aba Distribuição
          da especialidade ou da modalidade, em Classificação dos exames.
        </p>
      </div>
      {turnos.isError ? (
        <AbaComErro onTentarDeNovo={() => void turnos.refetch()}>
          Não foi possível carregar os turnos da escala agora.
        </AbaComErro>
      ) : !turnos.data ? (
        <CamposCarregando quantidade={6} />
      ) : (
        <FormConfiguracaoDistribuicao
          configuracao={configuracao}
          prioridades={catalogo.prioridades}
          turnos={turnos.data.itens}
          podeEditar={pode(sessao, 'distribuicao-config.editar')}
          onSalvar={async (nova) => {
            await configuracaoDistribuicaoControllerSalvar({ body: nova }).unwrap();
            await queryClient.invalidateQueries({ queryKey: opcoes.queryKey });
            sucesso('Configuração da distribuição salva.');
          }}
        />
      )}
    </div>
  );
}
