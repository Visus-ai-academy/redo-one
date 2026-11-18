import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { AbaComErro } from '../../../components/distribuicao/estados';
import { FormConfiguracaoDistribuicao } from '../../../components/distribuicao/FormConfiguracaoDistribuicao';
import { PrioridadesOperacao } from '../../../components/distribuicao/PrioridadesOperacao';
import { SecaoGradeRecebimento } from '../../../components/distribuicao/SecaoGradeRecebimento';
import { SemPermissao } from '../../../components/estado/estados';
import { CamposCarregando } from '../../../components/skeleton/CamposCarregando';
import { useAvisos } from '../../../components/toast/use-avisos';
import { configuracaoDistribuicaoControllerSalvar } from '../../../gen/clients/configuracaoDistribuicaoControllerSalvar';
import { gradeRecebimentoControllerSalvar } from '../../../gen/clients/gradeRecebimentoControllerSalvar';
import { prioridadesOperacaoControllerCriar } from '../../../gen/clients/prioridadesOperacaoControllerCriar';
import { prioridadesOperacaoControllerEditar } from '../../../gen/clients/prioridadesOperacaoControllerEditar';
import { prioridadesOperacaoControllerExcluir } from '../../../gen/clients/prioridadesOperacaoControllerExcluir';
import { configuracaoDistribuicaoControllerObterQueryOptions } from '../../../gen/hooks/useConfiguracaoDistribuicaoControllerObter';
import { gradeRecebimentoControllerObterQueryOptions } from '../../../gen/hooks/useGradeRecebimentoControllerObter';
import { prioridadesOperacaoControllerListarQueryOptions } from '../../../gen/hooks/usePrioridadesOperacaoControllerListar';
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
      context.queryClient.ensureQueryData(prioridadesOperacaoControllerListarQueryOptions()),
      context.queryClient.ensureQueryData(gradeRecebimentoControllerObterQueryOptions()),
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
  const opcoesPrioridades = prioridadesOperacaoControllerListarQueryOptions();
  const { data: prioridades } = useSuspenseQuery(opcoesPrioridades);
  const opcoesGrade = gradeRecebimentoControllerObterQueryOptions();
  const { data: grade } = useSuspenseQuery(opcoesGrade);
  const podeEditar = pode(sessao, 'distribuicao-config.editar');
  // Mudar uma prioridade (ou excluí-la) mexe na grade: as duas voltam juntas.
  const recarregarPrioridades = async () => {
    await queryClient.invalidateQueries({ queryKey: opcoesPrioridades.queryKey });
    await queryClient.invalidateQueries({ queryKey: opcoesGrade.queryKey });
  };
  // Os turnos vêm da escala (`escala.ver`, que a tela exige no catálogo de permissões).
  const turnos = useQuery(turnosControllerListarQueryOptions(TURNOS));

  return (
    <div className="flex max-w-[920px] flex-col gap-6">
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
        <>
          <PrioridadesOperacao
            prioridades={prioridades}
            podeEditar={podeEditar}
            onCriar={async (dados) => {
              await prioridadesOperacaoControllerCriar({ body: dados }).unwrap();
              await recarregarPrioridades();
              sucesso('Prioridade criada.');
            }}
            onEditar={async (id, dados) => {
              await prioridadesOperacaoControllerEditar({ path: { id }, body: dados }).unwrap();
              await recarregarPrioridades();
              sucesso('Prioridade salva.');
            }}
            onExcluir={async (id) => {
              await prioridadesOperacaoControllerExcluir({ path: { id } }).unwrap();
              await recarregarPrioridades();
              sucesso('Prioridade excluída.');
            }}
          />
          <SecaoGradeRecebimento
            // Remonta com a grade nova quando as prioridades mudam (a exclusão tira células).
            key={JSON.stringify(grade.celulas)}
            prioridades={prioridades}
            turnos={turnos.data.itens}
            celulas={grade.celulas}
            podeEditar={podeEditar}
            onSalvar={async (celulas) => {
              await gradeRecebimentoControllerSalvar({ body: { celulas } }).unwrap();
              await queryClient.invalidateQueries({ queryKey: opcoesGrade.queryKey });
              sucesso('Grade de recebimento salva.');
            }}
          />
          <FormConfiguracaoDistribuicao
            configuracao={configuracao}
            turnos={turnos.data.itens}
            podeEditar={podeEditar}
            onSalvar={async (nova) => {
              await configuracaoDistribuicaoControllerSalvar({ body: nova }).unwrap();
              await queryClient.invalidateQueries({ queryKey: opcoes.queryKey });
              sucesso('Configuração da distribuição salva.');
            }}
          />
        </>
      )}
    </div>
  );
}
