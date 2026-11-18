import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { AbaComErro } from '../../../components/distribuicao/estados';
import { FormConfiguracaoDistribuicao } from '../../../components/distribuicao/FormConfiguracaoDistribuicao';
import { PrioridadesOperacao } from '../../../components/distribuicao/PrioridadesOperacao';
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
    await Promise.all([
      // Esperado (sem lançar: o erro vira o aviso da tela) para o SSR e o cliente renderizarem
      // o mesmo: sem o await, o servidor desenhava o esqueleto e o cliente hidratava já com os
      // turnos e as prioridades (erro de hidratação).
      context.queryClient.prefetchQuery(turnosControllerListarQueryOptions(TURNOS)),
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
          <FormConfiguracaoDistribuicao
            configuracao={configuracao}
            celulas={grade.celulas}
            turnos={turnos.data.itens}
            prioridades={prioridades}
            podeEditar={podeEditar}
            // Um botão só: a configuração e a grade (a API não audita o que não mudou).
            onSalvar={async (nova, celulas) => {
              await configuracaoDistribuicaoControllerSalvar({ body: nova }).unwrap();
              await gradeRecebimentoControllerSalvar({ body: { celulas } }).unwrap();
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: opcoes.queryKey }),
                queryClient.invalidateQueries({ queryKey: opcoesGrade.queryKey }),
              ]);
              sucesso('Configuração da distribuição salva.');
            }}
          />
        </>
      )}
    </div>
  );
}
