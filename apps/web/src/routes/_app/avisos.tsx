import { Button } from '@base-ui/react/button';
import { X } from '@phosphor-icons/react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';

import { DetalheAviso } from '../../components/avisos/DetalheAviso';
import { buttonClassName } from '../../components/button/button-class';
import { ListaCadastro } from '../../components/cadastro/ListaCadastro';
import { createDataTableColumnHelper } from '../../components/data-table/columns';
import { LinkDaLinha } from '../../components/data-table/link-da-linha';
import { EstadoDoErro } from '../../components/estado/EstadoDoErro';
import { SemPermissao } from '../../components/estado/estados';
import { Etiqueta } from '../../components/etiqueta/Etiqueta';
import { PainelCarregando } from '../../components/painel/PainelCarregando';
import { PainelLateral } from '../../components/painel/PainelLateral';
import { Select } from '../../components/select/Select';
import { useFaseDoCarregamento } from '../../components/skeleton/use-fase-do-carregamento';
import { useAvisos } from '../../components/toast/use-avisos';
import { avisosControllerIgnorar } from '../../gen/clients/avisosControllerIgnorar';
import { avisosControllerReabrir } from '../../gen/clients/avisosControllerReabrir';
import {
  avisosControllerListarQueryKey,
  avisosControllerListarQueryOptions,
} from '../../gen/hooks/useAvisosControllerListar';
import { avisosControllerObterQueryOptions } from '../../gen/hooks/useAvisosControllerObter';
import type { AvisoDto } from '../../gen/types/AvisoDto';
import { tipoAviso } from '../../gen/types/TipoAviso';
import { competenciasDoAviso, ondeProcurar, situacaoDoAviso, tipoDoAviso } from '../../lib/avisos';
import { dataHoraCurta } from '../../lib/datas';
import { numero } from '../../lib/formato';
import { pode } from '../../lib/permissoes';

const POR_PAGINA = 25;
const TIPOS = Object.values(tipoAviso);

const buscaSchema = z.object({
  busca: z.string().trim().min(1).optional().catch(undefined),
  tipo: z.enum(TIPOS).optional().catch(undefined),
  /** Sem situação na URL, a lista mostra os pendentes (o trabalho da tela). */
  situacao: z.enum(['ignorado', 'resolvido', 'todas']).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
  /** Só os tipos de que algum papel do usuário é responsável (o link da faixa do topo). */
  meus: z.literal(1).optional().catch(undefined),
  /** Só os ligados a esta competência (o link do fechamento recusado). */
  competencia: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
  /** Só os de um item (o link do selo com mais de um aviso). */
  entidade: z.string().min(1).max(40).optional().catch(undefined),
  entidadeId: z.uuid().optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const consulta = (b: Busca) => ({
  query: {
    busca: b.busca,
    tipo: b.tipo,
    meus: b.meus ? true : undefined,
    competencia: b.competencia,
    ...(b.entidade && b.entidadeId && { entidade: b.entidade, entidadeId: b.entidadeId }),
    status: b.situacao === 'todas' ? undefined : (b.situacao ?? ('pendente' as const)),
    pagina: b.pagina ?? 1,
    porPagina: POR_PAGINA,
  },
});

export const Route = createFileRoute('/_app/avisos')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    if (!pode(context.sessao, 'avisos.ver')) return;
    if (deps.id)
      void context.queryClient.prefetchQuery(
        avisosControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    // Na própria tela (filtro, página, painel), a lista busca sozinha e deixa a de antes à vista,
    // esmaecida, enquanto isso.
    if (cause !== 'stay')
      await context.queryClient.ensureQueryData(avisosControllerListarQueryOptions(consulta(deps)));
  },
  head: () => ({ meta: [{ title: 'Avisos · One' }] }),
  component: PaginaAvisos,
  errorComponent: ErroDaTela,
});

/** Não abriu (sem permissão na API, servidor fora): o estado do erro pelo código HTTP. */
function ErroDaTela({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[22px] leading-snug font-semibold">Avisos</h1>
      <EstadoDoErro
        erro={error}
        oQue="os avisos"
        onTentarDeNovo={() => void router.invalidate()}
        className="p-0"
      />
    </div>
  );
}

function PaginaAvisos() {
  const { sessao } = Route.useRouteContext();
  return pode(sessao, 'avisos.ver') ? <Avisos /> : <SemPermissao tela="Avisos" />;
}

const coluna = createDataTableColumnHelper<AvisoDto>();
const PAGINA_VAZIA = { itens: [], tipos: [], total: 0, pagina: 1, porPagina: POR_PAGINA };
function Avisos() {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const lista = useQuery({
    ...avisosControllerListarQueryOptions(consulta(busca)),
    placeholderData: keepPreviousData,
  });
  const pagina = lista.data ?? PAGINA_VAZIA;

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const filtrar = useCallback(
    (novos: Partial<Busca>) => ir((a) => ({ ...a, ...novos, pagina: undefined }), true),
    [ir],
  );

  const colunas = useMemo(
    () => [
      coluna.accessor('valor', {
        header: 'Aviso',
        cell: (info) => (
          <LinkDaLinha
            from={Route.fullPath}
            to="."
            search={(a: Busca) => ({ ...a, id: info.row.original.id })}
          >
            {/* Texto longo fica em 2 linhas; o inteiro está no painel (e no title). */}
            <span title={info.getValue()} className="line-clamp-2 min-w-60 break-words">
              {info.getValue()}
            </span>
          </LinkDaLinha>
        ),
      }),
      coluna.accessor('tipo', {
        header: 'Tipo',
        cell: (info) => <span className="whitespace-nowrap">{tipoDoAviso(info.getValue())}</span>,
      }),
      coluna.accessor('competencias', {
        header: 'Competência',
        cell: (info) => (
          <span className="whitespace-nowrap tabular-nums">
            {competenciasDoAviso(info.getValue()) ?? '—'}
          </span>
        ),
      }),
      coluna.accessor('ocorrencias', {
        header: () => <span className="block text-right">Ocorrências</span>,
        cell: (info) => (
          <span className="block text-right tabular-nums">{numero(info.getValue())}</span>
        ),
      }),
      coluna.accessor('ultimaVezEm', {
        header: 'Visto por último',
        cell: (info) => (
          <span className="whitespace-nowrap tabular-nums">{dataHoraCurta(info.getValue())}</span>
        ),
      }),
      coluna.accessor('status', {
        header: 'Situação',
        cell: (info) => {
          const s = situacaoDoAviso(info.getValue());
          return <Etiqueta tom={s.tom}>{s.texto}</Etiqueta>;
        },
      }),
    ],
    [],
  );

  return (
    <ListaCadastro
      titulo="Avisos"
      busca={{
        valor: busca.busca,
        rotulo: 'Buscar avisos',
        placeholder: 'Texto do aviso',
      }}
      temFiltro={
        busca.tipo !== undefined ||
        busca.situacao !== undefined ||
        busca.meus !== undefined ||
        busca.competencia !== undefined ||
        busca.entidadeId !== undefined
      }
      filtros={
        <>
          <Select
            aria-label="Filtrar por responsável"
            value={busca.meus ? 'meus' : ''}
            onValueChange={(valor) => filtrar({ meus: valor === 'meus' ? 1 : undefined })}
            opcoes={[
              { valor: '', rotulo: 'De todos' },
              { valor: 'meus', rotulo: 'Só os meus' },
            ]}
            className="flex-[1_1_140px] md:flex-[0_1_160px]"
          />
          <Select
            aria-label="Filtrar por tipo"
            value={busca.tipo ?? ''}
            onValueChange={(valor) => filtrar({ tipo: (valor || undefined) as Busca['tipo'] })}
            // Só os tipos que o usuário vê (os da tela onde cada um se resolve), vindos da API.
            opcoes={[
              { valor: '', rotulo: 'Todos os tipos' },
              ...pagina.tipos.map((t) => ({ valor: t, rotulo: tipoDoAviso(t) })),
            ]}
            className="flex-[1_1_180px] md:flex-[0_1_200px]"
          />
          <Select
            aria-label="Filtrar por situação"
            value={busca.situacao ?? ''}
            onValueChange={(valor) =>
              filtrar({ situacao: (valor || undefined) as Busca['situacao'] })
            }
            opcoes={[
              { valor: '', rotulo: 'Pendentes' },
              { valor: 'ignorado', rotulo: 'Ignorados' },
              { valor: 'resolvido', rotulo: 'Resolvidos' },
              { valor: 'todas', rotulo: 'Todas as situações' },
            ]}
            className="flex-[1_1_180px] md:flex-[0_1_200px]"
          />
          {busca.competencia && (
            <FiltroFixo
              rotulo={`Competência ${competenciasDoAviso({ desde: busca.competencia, ate: busca.competencia })}`}
              onRemover={() => filtrar({ competencia: undefined })}
            />
          )}
          {busca.entidadeId && (
            <FiltroFixo
              rotulo="Só os do item"
              onRemover={() => filtrar({ entidade: undefined, entidadeId: undefined })}
            />
          )}
        </>
      }
      colunas={colunas}
      itens={pagina.itens}
      getRowId={(item) => item.id}
      selecionadoId={busca.id}
      recarregando={lista.isPlaceholderData || !lista.data}
      erro={
        lista.isError && !lista.data
          ? { erro: lista.error, oQue: 'os avisos', onTentarDeNovo: () => void lista.refetch() }
          : undefined
      }
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhum aviso pendente.',
        texto:
          'Inconsistências achadas pela importação, pela rodada da distribuição ou pela carga do dashboards-one aparecem aqui.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() =>
        filtrar({
          busca: undefined,
          tipo: undefined,
          situacao: undefined,
          meus: undefined,
          competencia: undefined,
          entidade: undefined,
          entidadeId: undefined,
        })
      }
      onIrPara={(numero) => ir((a) => ({ ...a, pagina: numero }))}
      painel={
        busca.id ? (
          <PainelDoAviso
            key={busca.id}
            id={busca.id}
            onFechar={() => ir((a) => ({ ...a, id: undefined }))}
          />
        ) : undefined
      }
    />
  );
}

function PainelDoAviso({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { sessao } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { sucesso } = useAvisos();
  const opcoes = avisosControllerObterQueryOptions({ path: { id } });
  const consulta = useQuery(opcoes);
  const aviso = consulta.data;
  const [alterado, setAlterado] = useState(false);
  const fase = useFaseDoCarregamento(!aviso);
  if (!aviso || fase !== 'conteudo')
    return (
      <PainelCarregando
        onFechar={onFechar}
        erro={consulta.error ?? undefined}
        oQue="o aviso"
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );
  const destino = ondeProcurar(aviso);
  // O aviso decidido sai da lista de pendentes, mas o painel continua com ele (já atualizado).
  const atualizar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: opcoes.queryKey }),
      queryClient.invalidateQueries({ queryKey: avisosControllerListarQueryKey() }),
    ]);

  return (
    <PainelLateral
      titulo={aviso.valor}
      subtitulo={tipoDoAviso(aviso.tipo)}
      alterado={alterado}
      onFechar={onFechar}
    >
      <DetalheAviso
        aviso={aviso}
        podeTriar={pode(sessao, 'avisos.triar')}
        onAlterado={setAlterado}
        procurar={
          <Link
            to={destino.to}
            search={destino.search as never}
            className={buttonClassName({ variant: 'secondary' })}
          >
            {destino.rotulo}
          </Link>
        }
        onIgnorar={async (motivo) => {
          await avisosControllerIgnorar({
            path: { id: aviso.id },
            body: { motivo },
          }).unwrap();
          await atualizar();
          // Ignorar é comum e a API sabe reabrir: em vez de confirmar antes, o aviso desfaz.
          sucesso('Aviso ignorado.', {
            acao: {
              rotulo: 'Desfazer',
              onClick: () =>
                void avisosControllerReabrir({ path: { id: aviso.id } })
                  .unwrap()
                  .then(atualizar, () => undefined),
            },
          });
        }}
        onReabrir={async () => {
          await avisosControllerReabrir({ path: { id: aviso.id } }).unwrap();
          sucesso('Aviso reaberto.');
          await atualizar();
        }}
      />
    </PainelLateral>
  );
}

/** Filtro que veio de um link (competência, item): à vista, com o X para tirar. */
function FiltroFixo({ rotulo, onRemover }: { rotulo: string; onRemover: () => void }) {
  return (
    <span className="bg-muted inline-flex h-9 items-center gap-1 rounded-md pr-1 pl-3 text-sm">
      {rotulo}
      <Button
        type="button"
        aria-label={`Tirar o filtro: ${rotulo}`}
        onClick={onRemover}
        className={buttonClassName({ variant: 'ghost', className: 'size-7 px-0' })}
      >
        <X size={14} aria-hidden />
      </Button>
    </span>
  );
}
