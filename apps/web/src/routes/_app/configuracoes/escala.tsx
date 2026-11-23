import {
  type QueryClient,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactNode, useCallback, useMemo } from 'react';
import { z } from 'zod';

import { Abas } from '../../../components/abas/Abas';
import { ListaCadastro } from '../../../components/cadastro/ListaCadastro';
import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { createDataTableColumnHelper } from '../../../components/data-table/columns';
import { LinkDaLinha } from '../../../components/data-table/link-da-linha';
import { rotuloDe, TIPOS_TURNO } from '../../../components/escala-config/comum';
import { formatarDuracao, formatarHorario } from '../../../components/escala-config/horario';
import { PainelTipoAusencia } from '../../../components/escala-config/PainelTipoAusencia';
import { PainelTurno } from '../../../components/escala-config/PainelTurno';
import { SemPermissao } from '../../../components/estado/estados';
import { Etiqueta } from '../../../components/etiqueta/Etiqueta';
import { PainelCarregando } from '../../../components/painel/PainelCarregando';
import { Select } from '../../../components/select/Select';
import { useFaseDoCarregamento } from '../../../components/skeleton/use-fase-do-carregamento';
import { useAvisos } from '../../../components/toast/use-avisos';
import { tiposAusenciaControllerAtualizar } from '../../../gen/clients/tiposAusenciaControllerAtualizar';
import { tiposAusenciaControllerCriar } from '../../../gen/clients/tiposAusenciaControllerCriar';
import { tiposAusenciaControllerExcluir } from '../../../gen/clients/tiposAusenciaControllerExcluir';
import { turnosControllerAtualizar } from '../../../gen/clients/turnosControllerAtualizar';
import { turnosControllerCriar } from '../../../gen/clients/turnosControllerCriar';
import { turnosControllerExcluir } from '../../../gen/clients/turnosControllerExcluir';
import { opcoesControllerListasQueryOptions } from '../../../gen/hooks/useOpcoesControllerListas';
import { tiposAusenciaControllerListarQueryOptions } from '../../../gen/hooks/useTiposAusenciaControllerListar';
import { tiposAusenciaControllerObterQueryOptions } from '../../../gen/hooks/useTiposAusenciaControllerObter';
import { turnosControllerListarQueryOptions } from '../../../gen/hooks/useTurnosControllerListar';
import { turnosControllerObterQueryOptions } from '../../../gen/hooks/useTurnosControllerObter';
import type { TipoAusenciaItemDto } from '../../../gen/types/TipoAusenciaItemDto';
import type { TurnoItemDto } from '../../../gen/types/TurnoItemDto';
import { type PodeNaTela, pode, podeNaTela } from '../../../lib/permissoes';

const POR_PAGINA = 25;
const ABAS = ['turnos', 'tipos-ausencia'] as const;
type AbaEscala = (typeof ABAS)[number];
const ROTULOS_ABA: Record<AbaEscala, string> = {
  turnos: 'Turnos',
  'tipos-ausencia': 'Tipos de ausência',
};

const buscaSchema = z.object({
  aba: z.enum(ABAS).optional().catch(undefined),
  busca: z.string().trim().min(1).optional().catch(undefined),
  situacao: z.enum(['ativos', 'inativos']).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  /** Item aberto no painel. */
  id: z.uuid().optional().catch(undefined),
  /** Painel de criação aberto. */
  novo: z.literal(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const consulta = (b: Busca) => ({
  query: {
    busca: b.busca,
    ativo: b.situacao === undefined ? undefined : b.situacao === 'ativos',
    pagina: b.pagina ?? 1,
    porPagina: POR_PAGINA,
  },
});

const listar = {
  turnos: (b: Busca) => turnosControllerListarQueryOptions(consulta(b)),
  'tipos-ausencia': (b: Busca) => tiposAusenciaControllerListarQueryOptions(consulta(b)),
} as const;

const obter = {
  turnos: (id: string) => turnosControllerObterQueryOptions({ path: { id } }),
  'tipos-ausencia': (id: string) => tiposAusenciaControllerObterQueryOptions({ path: { id } }),
} as const;

/** Depois de qualquer escrita, refaz as consultas da escala (listas e item). */
function invalidarEscala(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (q) => {
      const chave = q.queryKey[0] as { url?: unknown } | undefined;
      return typeof chave?.url === 'string' && chave.url.startsWith('/escala/');
    },
  });
}

export const Route = createFileRoute('/_app/configuracoes/escala')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'escala-config.ver')) return;
    const aba = deps.aba ?? 'turnos';
    // O item vem depois: o painel abre na hora, com o skeleton, enquanto ele carrega.
    if (deps.id) void context.queryClient.prefetchQuery(obter[aba](deps.id) as never);
    const editando =
      (deps.id && pode(context.sessao, 'escala-config.editar')) ||
      (deps.novo && pode(context.sessao, 'escala-config.criar'));
    await Promise.all([
      context.queryClient.ensureQueryData(listar[aba](deps) as never),
      ...(editando && aba === 'turnos'
        ? [context.queryClient.ensureQueryData(opcoesControllerListasQueryOptions())]
        : []),
    ]);
  },
  head: () => ({ meta: [{ title: 'Escala | Configurações | One' }] }),
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'escala-config.ver') ? (
        <Escala permissoes={podeNaTela(sessao, 'escala-config')} />
      ) : (
        <SemPermissao tela="Escala" />
      )}
    </ConfiguracoesLayout>
  );
}

const situacao = (ativo: boolean, feminino = false) =>
  ativo ? (
    <Etiqueta tom="sucesso">{feminino ? 'Ativa' : 'Ativo'}</Etiqueta>
  ) : (
    <Etiqueta tom="inativo">{feminino ? 'Inativa' : 'Inativo'}</Etiqueta>
  );

/** Bolinha com a cor cadastrada (é dado, não token do tema) antes do nome. */
function ComCor({ cor, children }: { cor: string | null; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="border-border size-3 flex-none rounded-full border"
        style={cor ? { backgroundColor: cor } : undefined}
      />
      {children}
    </span>
  );
}

const colTurno = createDataTableColumnHelper<TurnoItemDto>();
const colTipo = createDataTableColumnHelper<TipoAusenciaItemDto>();

/** Rótulos do que muda de uma aba para outra. */
const TEXTOS: Record<
  AbaEscala,
  { novo: string; buscar: string; placeholder: string; vazio: string; textoVazio: string }
> = {
  turnos: {
    novo: 'Novo turno',
    buscar: 'Buscar turnos',
    placeholder: 'Nome ou descrição',
    vazio: 'Nenhum turno cadastrado.',
    textoVazio: 'Cadastre os turnos (Manhã, Tarde, Lista…) para montar a escala.',
  },
  'tipos-ausencia': {
    novo: 'Novo tipo de ausência',
    buscar: 'Buscar tipos de ausência',
    placeholder: 'Nome ou descrição',
    vazio: 'Nenhum tipo de ausência cadastrado.',
    textoVazio: 'Cadastre os tipos (Férias, Congresso, Falta…) para lançar as ausências.',
  },
};

type Pagina<T> = { itens: T[]; pagina: number; porPagina: number; total: number };

function Escala({ permissoes }: { permissoes: PodeNaTela }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const aba = busca.aba ?? 'turnos';
  const { data } = useSuspenseQuery(listar[aba](busca) as ReturnType<typeof listar.turnos>);
  const pagina = data as unknown as Pagina<{ id: string }>;
  const textos = TEXTOS[aba];

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const filtrar = useCallback(
    (novos: Partial<Busca>) => ir((a) => ({ ...a, ...novos, pagina: undefined }), true),
    [ir],
  );
  const abrir = useCallback((id: string) => ir((a) => ({ ...a, id, novo: undefined })), [ir]);

  const colunas = useMemo(() => {
    const ativo = (feminino = false) => ({
      header: 'Situação',
      cell: (info: { getValue: () => boolean }) => situacao(info.getValue(), feminino),
    });
    // O nome é link de verdade (com o `?id=`): Ctrl/⌘+clique abre o item em outra aba.
    const abrirNome = (id: string, texto: string, cor: string | null) => (
      <ComCor cor={cor}>
        <LinkDaLinha
          from="/configuracoes/escala"
          to="/configuracoes/escala"
          search={(a) => ({ ...a, id, novo: undefined })}
        >
          {texto}
        </LinkDaLinha>
      </ComCor>
    );
    if (aba === 'turnos')
      return [
        colTurno.accessor('nome', {
          header: 'Nome',
          cell: (info) => abrirNome(info.row.original.id, info.getValue(), info.row.original.cor),
        }),
        colTurno.accessor('tipo', {
          header: 'Tipo',
          cell: (info) => rotuloDe(TIPOS_TURNO, info.getValue()),
        }),
        colTurno.accessor((t) => formatarHorario(t.horarioInicio, t.horarioFim), {
          id: 'horario',
          header: 'Horário',
          cell: (info) => (
            <span className="tabular-nums">
              {info.getValue()}{' '}
              <span className="text-muted-foreground">
                ({formatarDuracao(info.row.original.duracaoMin)})
              </span>
            </span>
          ),
        }),
        colTurno.accessor('frentes', {
          header: 'Especialidades e modalidades',
          cell: (info) =>
            info.getValue().length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="flex flex-wrap gap-1">
                {info.getValue().map((f) => (
                  <span
                    key={f.id}
                    className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
                  >
                    {f.rotulo}
                  </span>
                ))}
              </span>
            ),
        }),
        colTurno.accessor('ativo', ativo()),
      ];
    return [
      colTipo.accessor('nome', {
        header: 'Nome',
        cell: (info) => abrirNome(info.row.original.id, info.getValue(), info.row.original.cor),
      }),
      colTipo.accessor('gravidade', {
        header: () => <span className="block text-right">Gravidade</span>,
        cell: (info) => <span className="block text-right tabular-nums">{info.getValue()}</span>,
      }),
      colTipo.accessor('soGestor', {
        header: 'Só o gestor lança',
        cell: (info) => (info.getValue() ? 'Sim' : 'Não'),
      }),
      colTipo.accessor('contaComoFalta', {
        header: 'Conta como falta',
        cell: (info) => (info.getValue() ? 'Sim' : 'Não'),
      }),
      colTipo.accessor('ativo', ativo()),
    ];
  }, [aba]);

  return (
    <ListaCadastro
      titulo="Escala"
      totalNoTitulo={false}
      abas={
        <Abas
          aria-label="Cadastros da escala"
          valor={aba}
          onMudar={(valor) => ir(() => ({ aba: valor as AbaEscala }))}
          abas={ABAS.map((valor) => ({ valor, rotulo: ROTULOS_ABA[valor] }))}
        />
      }
      novo={
        permissoes.criar
          ? {
              rotulo: textos.novo,
              onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })),
            }
          : undefined
      }
      busca={{ valor: busca.busca, rotulo: textos.buscar, placeholder: textos.placeholder }}
      temFiltro={busca.situacao !== undefined}
      filtros={
        <Select
          aria-label="Filtrar por situação"
          value={busca.situacao ?? ''}
          onValueChange={(valor) =>
            filtrar({ situacao: (valor || undefined) as Busca['situacao'] })
          }
          opcoes={[
            { valor: '', rotulo: 'Todas as situações' },
            { valor: 'ativos', rotulo: 'Ativos' },
            { valor: 'inativos', rotulo: 'Inativos' },
          ]}
          className="flex-[1_1_180px] md:flex-[0_1_200px]"
        />
      }
      // biome-ignore lint/suspicious/noExplicitAny: as colunas mudam de tipo conforme a aba.
      colunas={colunas as any}
      itens={pagina.itens}
      getRowId={(item) => item.id}
      selecionadoId={busca.id}
      onAbrir={abrir}
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: textos.vazio,
        texto: permissoes.criar ? textos.textoVazio : 'Quem administra a escala cadastra os itens.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() => filtrar({ busca: undefined, situacao: undefined })}
      onIrPara={(numero) => ir((a) => ({ ...a, pagina: numero }))}
      painel={
        // Só com um painel aberto: no celular, a lista some quando há painel.
        busca.id || (busca.novo && permissoes.criar) ? (
          <PainelDoItem
            key={`${aba}:${busca.id ?? 'novo'}`}
            aba={aba}
            id={busca.id}
            permissoes={permissoes}
          />
        ) : undefined
      }
    />
  );
}

/** Rótulo de cada aba nos avisos de sucesso. */
const AVISOS: Record<AbaEscala, { criado: string; salvo: string; excluido: string }> = {
  turnos: { criado: 'Turno criado.', salvo: 'Turno salvo.', excluido: 'Turno excluído.' },
  'tipos-ausencia': {
    criado: 'Tipo de ausência criado.',
    salvo: 'Tipo de ausência salvo.',
    excluido: 'Tipo de ausência excluído.',
  },
};

function PainelDoItem({
  aba,
  id,
  permissoes,
}: {
  aba: AbaEscala;
  id?: string;
  permissoes: PodeNaTela;
}) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { sucesso } = useAvisos();
  const consulta = useQuery({
    ...(obter[aba](id ?? '') as ReturnType<typeof obter.turnos>),
    enabled: Boolean(id),
  });
  const editar = id ? permissoes.editar : permissoes.criar;
  const opcoes = useQuery({
    ...opcoesControllerListasQueryOptions(),
    enabled: editar && aba === 'turnos',
  });

  const fechar = () => void navigate({ search: (a) => ({ ...a, id: undefined, novo: undefined }) });
  const salvo = async (novoId: string) => {
    sucesso(id ? AVISOS[aba].salvo : AVISOS[aba].criado);
    await invalidarEscala(queryClient);
    void navigate({ search: (a) => ({ ...a, novo: undefined, id: novoId }), replace: true });
  };
  const excluido = async () => {
    sucesso(AVISOS[aba].excluido);
    fechar();
    await invalidarEscala(queryClient);
  };

  const faltaOpcoes = editar && aba === 'turnos' && !opcoes.data;
  const erro = consulta.isError || opcoes.isError;
  // O skeleton só aparece após ~200ms e, se apareceu, fica ~400ms: resposta rápida não pisca.
  const fase = useFaseDoCarregamento(((Boolean(id) && !consulta.data) || faltaOpcoes) && !erro);
  const item = id && fase === 'conteudo' ? consulta.data : undefined;
  if ((id && !item) || faltaOpcoes || fase !== 'conteudo')
    return (
      <PainelCarregando
        onFechar={fechar}
        erro={erro}
        onTentarDeNovo={() => {
          void consulta.refetch();
          if (opcoes.isError) void opcoes.refetch();
        }}
      />
    );

  if (aba === 'turnos')
    return (
      <PainelTurno
        turno={item as TurnoItemDto | undefined}
        especialidades={opcoes.data?.especialidades ?? []}
        modalidades={opcoes.data?.modalidades ?? []}
        podeEditar={id ? permissoes.editar : permissoes.criar}
        onFechar={fechar}
        onSalvar={async (dados) => {
          if (id) {
            const { avisos } = await turnosControllerAtualizar({
              path: { id },
              body: dados,
            }).unwrap();
            await salvo(id);
            // Ex.: inativado com alocações vigentes; aparece no painel, depois do toast.
            return avisos.map((aviso) => aviso.mensagem);
          }
          const criado = await turnosControllerCriar({ body: dados }).unwrap();
          await salvo(criado.id);
          return undefined;
        }}
        onExcluir={
          id && permissoes.excluir
            ? async () => {
                await turnosControllerExcluir({ path: { id } }).unwrap();
                await excluido();
              }
            : undefined
        }
      />
    );

  return (
    <PainelTipoAusencia
      tipo={item as TipoAusenciaItemDto | undefined}
      podeEditar={id ? permissoes.editar : permissoes.criar}
      onFechar={fechar}
      onSalvar={async (dados) => {
        if (id) {
          await tiposAusenciaControllerAtualizar({ path: { id }, body: dados }).unwrap();
          await salvo(id);
        } else {
          const criado = await tiposAusenciaControllerCriar({ body: dados }).unwrap();
          await salvo(criado.id);
        }
      }}
      onExcluir={
        id && permissoes.excluir
          ? async () => {
              await tiposAusenciaControllerExcluir({ path: { id } }).unwrap();
              await excluido();
            }
          : undefined
      }
    />
  );
}
