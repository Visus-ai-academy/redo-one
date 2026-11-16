import { FileArrowUp } from '@phosphor-icons/react';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { BotaoAbrir, ListaCadastro } from '../../components/cadastro/ListaCadastro';
import { createDataTableColumnHelper } from '../../components/data-table/columns';
import { EnvioDeArquivo } from '../../components/envio-arquivo/EnvioDeArquivo';
import { SemPermissao } from '../../components/estado/estados';
import { Etiqueta } from '../../components/etiqueta/Etiqueta';
import { DetalheImportacao } from '../../components/importacao/DetalheImportacao';
import { PainelCarregando } from '../../components/painel/PainelCarregando';
import { PainelLateral } from '../../components/painel/PainelLateral';
import { useAvisos } from '../../components/toast/use-avisos';
import { importacoesControllerBaixarArquivo } from '../../gen/clients/importacoesControllerBaixarArquivo';
import {
  importacoesControllerListarQueryKey,
  importacoesControllerListarQueryOptions,
} from '../../gen/hooks/useImportacoesControllerListar';
import { importacoesControllerObterQueryOptions } from '../../gen/hooks/useImportacoesControllerObter';
import type { ImportacaoDto } from '../../gen/types/ImportacaoDto';
import { dataHoraCurta } from '../../lib/datas';
import { atualizarEnquantoRoda, enviarPlanilha, situacaoDaImportacao } from '../../lib/importacao';
import { pode } from '../../lib/permissoes';

const POR_PAGINA = 25;

const buscaSchema = z.object({
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
  novo: z.literal(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const consulta = (b: Busca) => ({ query: { pagina: b.pagina ?? 1, porPagina: POR_PAGINA } });

export const Route = createFileRoute('/_app/importacao')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'importacao.ver')) return;
    if (deps.id)
      void context.queryClient.prefetchQuery(
        importacoesControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    await context.queryClient.ensureQueryData(
      importacoesControllerListarQueryOptions(consulta(deps)),
    );
  },
  head: () => ({ meta: [{ title: 'Importação de laudos | One' }] }),
  component: PaginaImportacao,
});

function PaginaImportacao() {
  const { sessao } = Route.useRouteContext();
  return pode(sessao, 'importacao.ver') ? (
    <Importacao />
  ) : (
    <SemPermissao tela="Importação de laudos" />
  );
}

const coluna = createDataTableColumnHelper<ImportacaoDto>();
const OCULTAR_COM_PAINEL = ['enviadaPor', 'removidos', 'atualizados', 'inseridos'];
const numero = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR'));
const aDireita = (texto: string) => () => <span className="block text-right">{texto}</span>;

function Importacao() {
  const { sessao } = Route.useRouteContext();
  const podeEnviar = pode(sessao, 'importacao.enviar');
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { data: pagina } = useSuspenseQuery({
    ...importacoesControllerListarQueryOptions(consulta(busca)),
    refetchInterval: (q) => atualizarEnquantoRoda(q.state.data?.itens ?? []),
    refetchIntervalInBackground: false,
  });

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const abrir = useCallback((id: string) => ir((a) => ({ ...a, id, novo: undefined })), [ir]);
  const fechar = () => ir((a) => ({ ...a, id: undefined, novo: undefined }));

  const colunas = useMemo(
    () => [
      coluna.accessor('criadaEm', {
        header: 'Enviada em',
        cell: (info) => (
          <BotaoAbrir onAbrir={() => abrir(info.row.original.id)}>
            <span className="whitespace-nowrap tabular-nums">{dataHoraCurta(info.getValue())}</span>
          </BotaoAbrir>
        ),
      }),
      coluna.accessor('nomeArquivo', {
        header: 'Arquivo',
        cell: (info) => <span className="block max-w-64 truncate">{info.getValue()}</span>,
      }),
      coluna.accessor('status', {
        header: 'Situação',
        cell: (info) => {
          const s = situacaoDaImportacao(info.getValue());
          return <Etiqueta tom={s.tom}>{s.texto}</Etiqueta>;
        },
      }),
      ...(['linhasArquivo', 'inseridos', 'atualizados', 'removidos'] as const).map((campo) =>
        coluna.accessor(campo, {
          header: aDireita(
            {
              linhasArquivo: 'Linhas',
              inseridos: 'Novos',
              atualizados: 'Alterados',
              removidos: 'Removidos',
            }[campo],
          ),
          cell: (info) => (
            <span className="block text-right tabular-nums">{numero(info.getValue())}</span>
          ),
        }),
      ),
      coluna.accessor((i) => i.enviadaPor?.nome ?? 'Robô', {
        id: 'enviadaPor',
        header: 'Enviada por',
      }),
    ],
    [abrir],
  );

  return (
    <ListaCadastro
      titulo="Importação de laudos"
      totalNoTitulo={false}
      novo={
        podeEnviar
          ? {
              rotulo: 'Enviar planilha',
              icone: FileArrowUp,
              onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })),
            }
          : undefined
      }
      colunas={colunas}
      ocultarComPainel={OCULTAR_COM_PAINEL}
      itens={pagina.itens}
      getRowId={(item) => item.id}
      selecionadoId={busca.id}
      onAbrir={abrir}
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhuma planilha importada ainda.',
        texto: podeEnviar
          ? 'Envie o relatório "Descritivo Especialidades" (ou o de compartilhamento) exportado da MobileMed.'
          : 'Quem cuida da importação envia as planilhas da MobileMed.',
      }}
      onFiltrar={() => undefined}
      onLimparFiltros={() => undefined}
      onIrPara={(numero) => ir((a) => ({ ...a, pagina: numero }))}
      painel={
        busca.novo && podeEnviar ? (
          <PainelEnvio
            key="novo"
            onFechar={fechar}
            onEnviada={async (id) => {
              await queryClient.invalidateQueries({
                queryKey: importacoesControllerListarQueryKey(),
              });
              ir((a) => ({ ...a, novo: undefined, id, pagina: undefined }), true);
            }}
          />
        ) : busca.id ? (
          <PainelDaImportacao key={busca.id} id={busca.id} onFechar={fechar} />
        ) : undefined
      }
    />
  );
}

function PainelEnvio({
  onFechar,
  onEnviada,
}: {
  onFechar: () => void;
  onEnviada: (id: string) => Promise<void>;
}) {
  const { sucesso } = useAvisos();
  return (
    <PainelLateral titulo="Enviar planilha" onFechar={onFechar}>
      <div className="p-4">
        <EnvioDeArquivo
          extensao=".xlsx"
          tamanhoMaximoMb={50}
          rotuloEnviar="Enviar planilha"
          ajuda={
            <>
              O relatório "Descritivo Especialidades" ou o "Compartilhamento de exames" exportado da
              MobileMed. Os laudos dos dias que a planilha cobre são atualizados; os que não vierem
              nela saem desses dias.
            </>
          }
          onEnviar={async (arquivo, onProgresso) => {
            const id = await enviarPlanilha(arquivo, onProgresso);
            sucesso('Planilha enviada. A importação está na fila.');
            await onEnviada(id);
          }}
        />
      </div>
    </PainelLateral>
  );
}

function PainelDaImportacao({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { sessao } = Route.useRouteContext();
  const consulta = useQuery({
    ...importacoesControllerObterQueryOptions({ path: { id } }),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status ? atualizarEnquantoRoda([{ status }]) : false;
    },
    refetchIntervalInBackground: false,
  });
  const importacao = consulta.data;
  if (!importacao)
    return (
      <PainelCarregando
        onFechar={onFechar}
        erro={consulta.isError}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );
  return (
    <PainelLateral
      titulo="Importação"
      subtitulo={dataHoraCurta(importacao.criadaEm)}
      onFechar={onFechar}
    >
      <DetalheImportacao
        importacao={importacao}
        onBaixar={
          pode(sessao, 'importacao.arquivo.baixar')
            ? async () => {
                const { url } = await importacoesControllerBaixarArquivo({ path: { id } }).unwrap();
                window.location.assign(url);
              }
            : undefined
        }
      />
    </PainelLateral>
  );
}
