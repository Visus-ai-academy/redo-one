import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { SemPermissao } from '../../../components/estado/estados';
import { EditorCorte } from '../../../components/faturamento/editor-corte';
import { Painel } from '../../../components/painel/Painel';
import { useGuardaDeSaida } from '../../../components/painel/use-guarda-de-saida';
import { competenciasControllerListarQueryOptions } from '../../../gen/hooks/useCompetenciasControllerListar';
import { cortesControllerListarQueryOptions } from '../../../gen/hooks/useCortesControllerListar';
import { pode } from '../../../lib/permissoes';

export const Route = createFileRoute('/_app/configuracoes/faturamento')({
  loader: async ({ context }) => {
    if (!pode(context.sessao, 'faturamento.ver')) return;
    // Sem lançar: a falha vira o aviso do próprio editor, com "Tentar de novo".
    await Promise.all([
      context.queryClient.prefetchQuery(cortesControllerListarQueryOptions()),
      context.queryClient.prefetchQuery(
        competenciasControllerListarQueryOptions({ query: { pagina: 1, porPagina: 100 } }),
      ),
    ]);
  },
  head: () => ({ meta: [{ title: 'Faturamento · Configurações · One' }] }),
  component: PaginaFaturamento,
});

function PaginaFaturamento() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'faturamento.ver') ? <Faturamento /> : <SemPermissao tela="Faturamento" />}
    </ConfiguracoesLayout>
  );
}

function Faturamento() {
  const { sessao } = Route.useRouteContext();
  const [alterado, setAlterado] = useState(false);
  const { confirmacao } = useGuardaDeSaida(alterado);
  return (
    <div className="flex max-w-[640px] flex-col gap-6">
      <h1 className="text-[22px] leading-snug font-semibold">Faturamento</h1>
      <Painel
        titulo="Corte da competência padrão"
        descricao="Até que dia, pela data do laudo, o laudo entra na competência. Vale para todos os clientes sem corte próprio (o corte próprio fica na aba Faturamento do cliente)."
      >
        <EditorCorte
          clienteId={null}
          podeEditar={pode(sessao, 'faturamento.corte.editar')}
          porPagina={10}
          onAlterado={setAlterado}
        />
      </Painel>
      {confirmacao}
    </div>
  );
}
