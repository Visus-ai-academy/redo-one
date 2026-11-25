import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { z } from 'zod';

import { PainelTipoAviso } from '../../../components/avisos/PainelTipoAviso';
import { ListaCadastro } from '../../../components/cadastro/ListaCadastro';
import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { createDataTableColumnHelper } from '../../../components/data-table/columns';
import { LinkDaLinha } from '../../../components/data-table/link-da-linha';
import { SemPermissao } from '../../../components/estado/estados';
import { Etiqueta } from '../../../components/etiqueta/Etiqueta';
import { useAvisos } from '../../../components/toast/use-avisos';
import { tiposAvisoControllerAtualizar } from '../../../gen/clients/tiposAvisoControllerAtualizar';
import { avisosControllerResumoDoResponsavelQueryKey } from '../../../gen/hooks/useAvisosControllerResumoDoResponsavel';
import { tiposAvisoControllerObterQueryOptions } from '../../../gen/hooks/useTiposAvisoControllerObter';
import type { ConfiguracaoTipoAvisoDto } from '../../../gen/types/ConfiguracaoTipoAvisoDto';
import { tipoAviso } from '../../../gen/types/TipoAviso';
import { significadoDoTipo, tipoDoAviso } from '../../../lib/avisos';
import { numero } from '../../../lib/formato';
import { pode } from '../../../lib/permissoes';

const buscaSchema = z.object({
  tipo: z.enum(Object.values(tipoAviso)).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

export const Route = createFileRoute('/_app/configuracoes/avisos')({
  validateSearch: buscaSchema,
  loader: async ({ context }) => {
    if (!pode(context.sessao, 'avisos-config.ver')) return;
    await context.queryClient.ensureQueryData(tiposAvisoControllerObterQueryOptions());
  },
  head: () => ({ meta: [{ title: 'Avisos · Configurações · One' }] }),
  component: PaginaTiposAviso,
});

function PaginaTiposAviso() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'avisos-config.ver') ? <TiposAviso /> : <SemPermissao tela="Avisos" />}
    </ConfiguracoesLayout>
  );
}

const coluna = createDataTableColumnHelper<ConfiguracaoTipoAvisoDto>();
const nada = () => undefined;

/**
 * Configurações › Avisos: para cada tipo de aviso, os papéis responsáveis (a faixa do topo) e se o
 * pendente impede fechar a competência. Lista curta e fixa (um por tipo); a linha abre o painel.
 */
function TiposAviso() {
  const { sessao } = Route.useRouteContext();
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { sucesso } = useAvisos();
  const opcoes = tiposAvisoControllerObterQueryOptions();
  const consulta = useQuery({ ...opcoes, placeholderData: keepPreviousData });
  const dados = consulta.data ?? { tipos: [], papeis: [] };
  const ir = (tipo: Busca['tipo']) => void navigate({ search: { tipo } });

  const colunas = useMemo(
    () => [
      coluna.accessor('tipo', {
        header: 'Tipo',
        cell: (info) => (
          <span className="flex min-w-0 flex-col">
            <LinkDaLinha from={Route.fullPath} to="." search={{ tipo: info.getValue() }}>
              {tipoDoAviso(info.getValue())}
            </LinkDaLinha>
            <span className="text-muted-foreground text-[13px]">
              {significadoDoTipo(info.getValue())}
            </span>
          </span>
        ),
      }),
      coluna.accessor('responsaveis', {
        header: 'Responsáveis',
        cell: (info) =>
          info.getValue().length ? (
            info
              .getValue()
              .map((r) => r.nome)
              .join(', ')
          ) : (
            <span className="text-subtle-foreground">Nenhum</span>
          ),
      }),
      coluna.accessor('impedeFecharCompetencia', {
        header: 'Fechamento',
        cell: (info) =>
          info.getValue() ? (
            <Etiqueta tom="atencao">Impede fechar</Etiqueta>
          ) : (
            <span className="text-subtle-foreground">Não impede</span>
          ),
      }),
      coluna.accessor('pendentes', {
        header: () => <span className="block text-right">Pendentes</span>,
        cell: (info) => (
          <span className="block text-right tabular-nums">{numero(info.getValue())}</span>
        ),
      }),
    ],
    [],
  );

  const aberto = dados.tipos.find((t) => t.tipo === busca.tipo);
  return (
    <ListaCadastro
      titulo="Avisos"
      totalNoTitulo={false}
      colunas={colunas}
      itens={dados.tipos}
      getRowId={(t) => t.tipo}
      selecionadoId={busca.tipo}
      recarregando={consulta.isPlaceholderData}
      erro={
        consulta.isError && !consulta.data
          ? {
              erro: consulta.error,
              oQue: 'os tipos de aviso',
              onTentarDeNovo: () => void consulta.refetch(),
            }
          : undefined
      }
      pagina={1}
      porPagina={Math.max(dados.tipos.length, 1)}
      total={dados.tipos.length}
      vazio={{ titulo: 'Nenhum tipo de aviso.', texto: 'Os tipos vêm com o sistema.' }}
      onFiltrar={nada}
      onLimparFiltros={nada}
      onIrPara={nada}
      painel={
        aberto ? (
          <PainelTipoAviso
            key={aberto.tipo}
            tipo={aberto}
            papeis={dados.papeis}
            podeEditar={pode(sessao, 'avisos-config.editar')}
            onFechar={() => ir(undefined)}
            onSalvar={async (body) => {
              await tiposAvisoControllerAtualizar({ path: { tipo: aberto.tipo }, body }).unwrap();
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: opcoes.queryKey }),
                queryClient.invalidateQueries({
                  queryKey: avisosControllerResumoDoResponsavelQueryKey(),
                }),
              ]);
              sucesso('Configuração do aviso salva.');
              ir(undefined);
            }}
          />
        ) : undefined
      }
    />
  );
}
