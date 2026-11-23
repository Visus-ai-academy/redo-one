import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { EstadoDoErro } from '../../../components/estado/EstadoDoErro';
import { SemPermissao } from '../../../components/estado/estados';
import { FormParametrosImportacao } from '../../../components/importacao/FormParametrosImportacao';
import { Painel } from '../../../components/painel/Painel';
import { useGuardaDeSaida } from '../../../components/painel/use-guarda-de-saida';
import { useAvisos } from '../../../components/toast/use-avisos';
import { parametrosIngestaoControllerAtualizar } from '../../../gen/clients/parametrosIngestaoControllerAtualizar';
import { importacaoMobileMedControllerSituacaoQueryOptions } from '../../../gen/hooks/useImportacaoMobileMedControllerSituacao';
import { parametrosIngestaoControllerObterQueryOptions } from '../../../gen/hooks/useParametrosIngestaoControllerObter';
import { pode } from '../../../lib/permissoes';

export const Route = createFileRoute('/_app/configuracoes/importacao')({
  loader: async ({ context }) => {
    if (!pode(context.sessao, 'importacao.ver')) return;
    await Promise.all([
      context.queryClient.ensureQueryData(parametrosIngestaoControllerObterQueryOptions()),
      context.queryClient.ensureQueryData(importacaoMobileMedControllerSituacaoQueryOptions()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Importação de laudos · Configurações · One' }] }),
  component: PaginaParametros,
  errorComponent: ErroDaTela,
});

/** Não abriu (sem permissão na API, servidor fora): o estado do erro pelo código HTTP. */
function ErroDaTela({ error }: ErrorComponentProps) {
  const { sessao } = Route.useRouteContext();
  const router = useRouter();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      <h1 className="text-[22px] leading-snug font-semibold">Importação de laudos</h1>
      <EstadoDoErro
        erro={error}
        oQue="os parâmetros da importação"
        onTentarDeNovo={() => void router.invalidate()}
        className="p-0"
      />
    </ConfiguracoesLayout>
  );
}

function PaginaParametros() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'importacao.ver') ? (
        <Parametros />
      ) : (
        <SemPermissao tela="Importação de laudos" />
      )}
    </ConfiguracoesLayout>
  );
}

function Parametros() {
  const { sessao } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { sucesso } = useAvisos();
  const opcoes = parametrosIngestaoControllerObterQueryOptions();
  const { data: parametros } = useSuspenseQuery(opcoes);
  const { data: mobilemed } = useSuspenseQuery(importacaoMobileMedControllerSituacaoQueryOptions());
  const [alterado, setAlterado] = useState(false);
  const { confirmacao } = useGuardaDeSaida(alterado);

  return (
    <div className="flex max-w-[640px] flex-col gap-6">
      <h1 className="text-[22px] leading-snug font-semibold">Importação de laudos</h1>
      <Painel titulo="Parâmetros">
        <FormParametrosImportacao
          parametros={parametros}
          podeEditar={pode(sessao, 'importacao.parametros.editar')}
          mobilemedLigada={mobilemed.ligada}
          onAlterado={setAlterado}
          onSalvar={async (novos) => {
            await parametrosIngestaoControllerAtualizar({ body: novos }).unwrap();
            await queryClient.invalidateQueries({ queryKey: opcoes.queryKey });
            sucesso('Parâmetros salvos.');
          }}
        />
      </Painel>
      {confirmacao}
    </div>
  );
}
