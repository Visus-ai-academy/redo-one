import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactNode, useId, useState } from 'react';
import { z } from 'zod';

import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { AbaComErro } from '../../../components/distribuicao/estados';
import { SemPermissao } from '../../../components/estado/estados';
import { TabelaPrecos } from '../../../components/faturamento/tabela-precos';
import { Painel } from '../../../components/painel/Painel';
import { useGuardaDeSaida } from '../../../components/painel/use-guarda-de-saida';
import { Select } from '../../../components/select/Select';
import { CamposCarregando } from '../../../components/skeleton/CamposCarregando';
import { precosControllerOpcoesQueryOptions } from '../../../gen/hooks/usePrecosControllerOpcoes';
import { contratadoEscolhido, ordenarContratados } from '../../../lib/catalogo';
import { pode } from '../../../lib/permissoes';

export const Route = createFileRoute('/_app/configuracoes/tabela-padrao')({
  validateSearch: z.object({ contratado: z.string().optional() }),
  loader: async ({ context }) => {
    if (!pode(context.sessao, 'faturamento.ver')) return;
    await context.queryClient.prefetchQuery(precosControllerOpcoesQueryOptions());
  },
  head: () => ({ meta: [{ title: 'Tabela padrão de preços · Configurações · One' }] }),
  component: PaginaTabelaPadrao,
});

function PaginaTabelaPadrao() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'faturamento.ver') ? (
        <TabelaPadrao />
      ) : (
        <SemPermissao tela="Tabela padrão de preços" />
      )}
    </ConfiguracoesLayout>
  );
}

/** A tabela padrão de cada contratado: o preço do arranjo que o cliente não tem. */
function TabelaPadrao() {
  const { sessao } = Route.useRouteContext();
  const { contratado } = Route.useSearch();
  const navigate = Route.useNavigate();
  const opcoes = useQuery(precosControllerOpcoesQueryOptions());
  const [alterado, setAlterado] = useState(false);
  const { confirmacao } = useGuardaDeSaida(alterado);
  const idContratado = useId();

  let conteudo: ReactNode;
  if (opcoes.isError)
    conteudo = (
      <AbaComErro onTentarDeNovo={() => void opcoes.refetch()}>
        Não foi possível carregar os contratados agora.
      </AbaComErro>
    );
  else if (!opcoes.data) conteudo = <CamposCarregando quantidade={3} />;
  else {
    const contratados = ordenarContratados(opcoes.data.contratados);
    const atual = contratadoEscolhido(contratados, contratado);
    conteudo = contratados.length ? (
      <div className="flex flex-col gap-4">
        <div className="flex max-w-[480px] flex-col gap-2">
          <label htmlFor={idContratado} className="font-medium">
            Contratado
          </label>
          <Select
            id={idContratado}
            value={atual?.id ?? ''}
            placeholder="Escolha o contratado"
            onValueChange={(id) => void navigate({ search: { contratado: id }, replace: true })}
            opcoes={contratados.map((c) => ({ valor: c.id, rotulo: c.nome }))}
          />
        </div>
        {atual ? (
          <TabelaPrecos
            key={atual.id}
            tipo="contratado"
            donoId={atual.id}
            veAvisos={pode(sessao, 'avisos.ver')}
            podeEditar={pode(sessao, 'faturamento.precos.editar')}
            onAlterado={setAlterado}
          />
        ) : (
          <p className="text-muted-foreground bg-muted rounded-md p-3 text-[13px]">
            Escolha o contratado para ver a tabela de preços dele.
          </p>
        )}
      </div>
    ) : (
      <p className="text-muted-foreground">Nenhum contratado ativo.</p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[22px] leading-snug font-semibold">Tabela padrão de preços</h1>
      <Painel
        titulo="Preços por contratado"
        descricao="Vale para o arranjo que a tabela do cliente (e a do cliente principal, na unidade) não tem. Cada contratado tem a sua."
      >
        {conteudo}
      </Painel>
      {confirmacao}
    </div>
  );
}
