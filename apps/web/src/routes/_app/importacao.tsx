import { Button } from '@base-ui/react/button';
import { ArrowsClockwise, FileArrowUp } from '@phosphor-icons/react';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import { Alerta } from '../../components/alerta/Alerta';
import { mensagemDaApi } from '../../components/alerta/mensagem-da-api';
import { buttonClassName } from '../../components/button/button-class';
import { ListaCadastro } from '../../components/cadastro/ListaCadastro';
import { createDataTableColumnHelper } from '../../components/data-table/columns';
import { LinkDaLinha } from '../../components/data-table/link-da-linha';
import { EnvioDeArquivo } from '../../components/envio-arquivo/EnvioDeArquivo';
import { EstadoDoErro } from '../../components/estado/EstadoDoErro';
import { SemPermissao } from '../../components/estado/estados';
import { Etiqueta } from '../../components/etiqueta/Etiqueta';
import { DetalheImportacao } from '../../components/importacao/DetalheImportacao';
import { PainelCarregando } from '../../components/painel/PainelCarregando';
import { PainelLateral } from '../../components/painel/PainelLateral';
import { useFaseDoCarregamento } from '../../components/skeleton/use-fase-do-carregamento';
import { useAvisos } from '../../components/toast/use-avisos';
import { importacaoMobileMedControllerImportarAgora } from '../../gen/clients/importacaoMobileMedControllerImportarAgora';
import { importacoesControllerBaixarArquivo } from '../../gen/clients/importacoesControllerBaixarArquivo';
import { importacaoMobileMedControllerSituacaoQueryOptions } from '../../gen/hooks/useImportacaoMobileMedControllerSituacao';
import {
  importacoesControllerListarQueryKey,
  importacoesControllerListarQueryOptions,
} from '../../gen/hooks/useImportacoesControllerListar';
import { importacoesControllerObterQueryOptions } from '../../gen/hooks/useImportacoesControllerObter';
import type { ImportacaoDto } from '../../gen/types/ImportacaoDto';
import { dataHoraCurta } from '../../lib/datas';
import { numero } from '../../lib/formato';
import {
  atualizarEnquantoRoda,
  enviarPlanilha,
  origemDaImportacao,
  situacaoDaImportacao,
  terminadas,
  textoDoFim,
} from '../../lib/importacao';
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
  loader: async ({ context, deps, cause }) => {
    if (!pode(context.sessao, 'importacao.ver')) return;
    if (deps.id)
      void context.queryClient.prefetchQuery(
        importacoesControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    // Na própria tela (página, painel), a lista busca sozinha e deixa a de antes à vista.
    await Promise.all([
      cause !== 'stay' &&
        context.queryClient.ensureQueryData(
          importacoesControllerListarQueryOptions(consulta(deps)),
        ),
      context.queryClient.ensureQueryData(importacaoMobileMedControllerSituacaoQueryOptions()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Importação de laudos · One' }] }),
  component: PaginaImportacao,
  errorComponent: ErroDaTela,
});

/** Não abriu (sem permissão na API, servidor fora): o estado do erro pelo código HTTP. */
function ErroDaTela({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] leading-snug font-semibold">Importação de laudos</h1>
      <EstadoDoErro
        erro={error}
        oQue="as importações"
        onTentarDeNovo={() => void router.invalidate()}
        className="p-0"
      />
    </div>
  );
}

function PaginaImportacao() {
  const { sessao } = Route.useRouteContext();
  return pode(sessao, 'importacao.ver') ? (
    <Importacao />
  ) : (
    <SemPermissao tela="Importação de laudos" />
  );
}

const coluna = createDataTableColumnHelper<ImportacaoDto>();
const PAGINA_VAZIA = { itens: [], total: 0, pagina: 1, porPagina: POR_PAGINA };
const quantidade = (n: number | null) => (n === null ? '—' : numero(n));
const aDireita = (texto: string) => () => <span className="block text-right">{texto}</span>;

function Importacao() {
  const { sessao } = Route.useRouteContext();
  const podeEnviar = pode(sessao, 'importacao.criar');
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { data: mobilemed } = useSuspenseQuery(importacaoMobileMedControllerSituacaoQueryOptions());
  const [erroMobileMed, setErroMobileMed] = useState<string | null>(null);
  const lista = useQuery({
    ...importacoesControllerListarQueryOptions(consulta(busca)),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => atualizarEnquantoRoda(q.state.data?.itens ?? []),
    refetchIntervalInBackground: false,
  });
  const pagina = lista.data ?? PAGINA_VAZIA;
  const fim = useAvisoDoFim(lista.isPlaceholderData ? undefined : lista.data?.itens);

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const fechar = () => ir((a) => ({ ...a, id: undefined, novo: undefined }));

  const colunas = useMemo(
    () => [
      coluna.accessor('criadaEm', {
        header: 'Enviada em',
        cell: (info) => (
          <LinkDaLinha
            from={Route.fullPath}
            to="."
            search={(a: Busca) => ({ ...a, id: info.row.original.id, novo: undefined })}
            className="whitespace-nowrap tabular-nums"
          >
            {dataHoraCurta(info.getValue())}
          </LinkDaLinha>
        ),
      }),
      coluna.accessor((i) => origemDaImportacao(i), {
        id: 'origem',
        header: 'Origem',
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
            <span className="block text-right tabular-nums">{quantidade(info.getValue())}</span>
          ),
        }),
      ),
      coluna.accessor((i) => i.enviadaPor?.nome ?? 'Robô', {
        id: 'enviadaPor',
        header: 'Enviada por',
      }),
    ],
    [],
  );

  const mobilemedEmCurso = pagina.itens.some(
    (i) => i.origem === 'mobilemed' && (i.status === 'na_fila' || i.status === 'processando'),
  );

  return (
    <>
      {/* O fim de uma importação que rodava é anunciado ao leitor de tela (e o concluído, em aviso). */}
      <p role="status" className="sr-only">
        {fim}
      </p>
      <ListaCadastro
        titulo="Importação de laudos"
        totalNoTitulo={false}
        acoes={
          podeEnviar && mobilemed.ligada ? (
            <>
              {erroMobileMed && <Alerta tom="erro">{erroMobileMed}</Alerta>}
              <BotaoImportarAgora
                emCurso={mobilemedEmCurso}
                onErro={setErroMobileMed}
                onImportada={async (id) => {
                  await queryClient.invalidateQueries({
                    queryKey: importacoesControllerListarQueryKey(),
                  });
                  ir((a) => ({ ...a, novo: undefined, id, pagina: undefined }), true);
                }}
              />
            </>
          ) : undefined
        }
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
        itens={pagina.itens}
        getRowId={(item) => item.id}
        selecionadoId={busca.id}
        recarregando={lista.isPlaceholderData || !lista.data}
        erro={
          lista.isError && !lista.data
            ? {
                erro: lista.error,
                oQue: 'as importações',
                onTentarDeNovo: () => void lista.refetch(),
              }
            : undefined
        }
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
    </>
  );
}

/**
 * Espera longa: a importação roda em segundo plano e a pessoa segue usando a tela. Quando uma que
 * rodava termina, avisa (toast no concluído) e devolve o texto para o anúncio do leitor de tela.
 */
function useAvisoDoFim(itens: ImportacaoDto[] | undefined) {
  const { sucesso } = useAvisos();
  const anteriores = useRef<ImportacaoDto[] | undefined>(undefined);
  const [texto, setTexto] = useState('');
  useEffect(() => {
    if (!itens) return;
    const fim = terminadas(anteriores.current, itens);
    anteriores.current = itens;
    if (fim.length === 0) return;
    const textos = fim.map(textoDoFim);
    setTexto(textos.join(' '));
    for (const [i, importacao] of fim.entries()) {
      if (importacao.status === 'concluida') sucesso(textos[i] ?? '');
    }
  }, [itens, sucesso]);
  return texto;
}

/** "Importar agora": põe na fila a importação da MobileMed do período configurado. */
function BotaoImportarAgora({
  emCurso,
  onErro,
  onImportada,
}: {
  emCurso: boolean;
  onErro: (mensagem: string | null) => void;
  onImportada: (id: string) => Promise<void>;
}) {
  const { sucesso } = useAvisos();
  const [enviando, setEnviando] = useState(false);
  return (
    <Button
      type="button"
      disabled={enviando || emCurso}
      title={emCurso ? 'Já há uma importação da MobileMed na fila ou em andamento.' : undefined}
      className={buttonClassName({ variant: 'secondary' })}
      onClick={async () => {
        setEnviando(true);
        onErro(null);
        try {
          const { ids } = await importacaoMobileMedControllerImportarAgora().unwrap();
          sucesso('Importação da MobileMed na fila.');
          if (ids[0]) await onImportada(ids[0]);
        } catch (erro) {
          onErro(mensagemDaApi(erro, 'Não foi possível pôr a importação na fila. Tente de novo.'));
        } finally {
          setEnviando(false);
        }
      }}
    >
      <ArrowsClockwise size={16} aria-hidden />
      {enviando ? 'Pondo na fila…' : emCurso ? 'Importando da MobileMed…' : 'Importar agora'}
    </Button>
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
  const fase = useFaseDoCarregamento(!importacao);
  if (!importacao || fase !== 'conteudo')
    return (
      <PainelCarregando
        onFechar={onFechar}
        erro={consulta.error ?? undefined}
        oQue="a importação"
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
