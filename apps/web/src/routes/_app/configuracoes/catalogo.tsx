import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { Abas } from '../../../components/abas/Abas';
import { BotaoAbrir, ListaCadastro } from '../../../components/cadastro/ListaCadastro';
import {
  ABAS_LISTAS,
  type AbaLista,
  type ConsultaLista,
  type ItemDaLista,
  LISTAS,
  type PaginaDaLista,
} from '../../../components/catalogo/listas';
import { PainelItemLista } from '../../../components/catalogo/PainelItemLista';
import { type Variacao, VariacoesForma } from '../../../components/catalogo/VariacoesForma';
import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { createDataTableColumnHelper } from '../../../components/data-table/columns';
import { SemPermissao } from '../../../components/estado/estados';
import { Etiqueta } from '../../../components/etiqueta/Etiqueta';
import { PainelCarregando } from '../../../components/painel/PainelCarregando';
import { Select } from '../../../components/select/Select';
import { CamposCarregando } from '../../../components/skeleton/CamposCarregando';
import { deParaEspecialidadesControllerCriar } from '../../../gen/clients/deParaEspecialidadesControllerCriar';
import { deParaEspecialidadesControllerExcluir } from '../../../gen/clients/deParaEspecialidadesControllerExcluir';
import { deParaPrioridadesControllerCriar } from '../../../gen/clients/deParaPrioridadesControllerCriar';
import { deParaPrioridadesControllerExcluir } from '../../../gen/clients/deParaPrioridadesControllerExcluir';
import { deParaEspecialidadesControllerListarQueryOptions } from '../../../gen/hooks/useDeParaEspecialidadesControllerListar';
import { deParaPrioridadesControllerListarQueryOptions } from '../../../gen/hooks/useDeParaPrioridadesControllerListar';
import { opcoesControllerListasQueryOptions } from '../../../gen/hooks/useOpcoesControllerListas';
import { invalidarCatalogo } from '../../../lib/catalogo';
import { pode } from '../../../lib/permissoes';

const POR_PAGINA = 25;

const buscaSchema = z.object({
  aba: z
    .enum(ABAS_LISTAS as [AbaLista, ...AbaLista[]])
    .optional()
    .catch(undefined),
  busca: z.string().trim().min(1).optional().catch(undefined),
  situacao: z.enum(['ativos', 'inativos']).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  /** Item aberto no painel. */
  id: z.uuid().optional().catch(undefined),
  /** Painel de criação aberto. */
  novo: z.literal(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const consulta = (busca: Busca): ConsultaLista => ({
  busca: busca.busca,
  ativo: busca.situacao === undefined ? undefined : busca.situacao === 'ativos',
  pagina: busca.pagina ?? 1,
  porPagina: POR_PAGINA,
});

export const Route = createFileRoute('/_app/configuracoes/catalogo')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'catalogo.ver')) return;
    const lista = LISTAS[deps.aba ?? 'modalidades'];
    // O item vem depois: o painel abre na hora, com o skeleton, enquanto ele carrega.
    if (deps.id) void context.queryClient.prefetchQuery(lista.obter(deps.id));
    await Promise.all([
      context.queryClient.ensureQueryData(lista.listar(consulta(deps))),
      context.queryClient.ensureQueryData(opcoesControllerListasQueryOptions()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Classificação dos exames | One' }] }),
  component: PaginaCatalogo,
});

function PaginaCatalogo() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'catalogo.ver') ? (
        <Listas podeEditar={pode(sessao, 'catalogo.editar')} />
      ) : (
        <SemPermissao tela="Classificação dos exames" />
      )}
    </ConfiguracoesLayout>
  );
}

const coluna = createDataTableColumnHelper<ItemDaLista>();

function Listas({ podeEditar }: { podeEditar: boolean }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const aba = busca.aba ?? 'modalidades';
  const lista = LISTAS[aba];
  const { data } = useSuspenseQuery(lista.listar(consulta(busca)));
  const pagina = data as PaginaDaLista;

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const filtrar = useCallback(
    (novos: Partial<Busca>) => ir((atual) => ({ ...atual, ...novos, pagina: undefined }), true),
    [ir],
  );
  const abrir = useCallback(
    (id: string) => ir((atual) => ({ ...atual, id, novo: undefined })),
    [ir],
  );

  const colunas = useMemo(
    () => [
      coluna.accessor('nome', {
        header: lista.rotulos.campoNome,
        cell: (info) => (
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="border-border size-3 flex-none rounded-full border"
              // Cor cadastrada pelo usuário: é dado, não token do tema.
              style={info.row.original.cor ? { backgroundColor: info.row.original.cor } : undefined}
            />
            <BotaoAbrir onAbrir={() => abrir(info.row.original.id)}>{info.getValue()}</BotaoAbrir>
          </span>
        ),
      }),
      coluna.accessor('descricao', {
        header: 'Descrição',
        cell: (info) => <span className="text-muted-foreground">{info.getValue() ?? '—'}</span>,
      }),
      coluna.accessor('ordem', {
        header: () => <span className="block text-right">Ordem</span>,
        cell: (info) => <span className="block text-right">{info.getValue()}</span>,
      }),
      ...(aba === 'prioridades' || aba === 'especialidades'
        ? [
            coluna.accessor((i) => (i as { totalVariacoes?: number }).totalVariacoes ?? 0, {
              id: 'variacoes',
              header: () => <span className="block text-right">Variações</span>,
              cell: (info) => <span className="block text-right">{info.getValue()}</span>,
            }),
          ]
        : []),
      coluna.accessor('ativo', {
        header: 'Situação',
        cell: (info) =>
          info.getValue() ? (
            <Etiqueta tom="sucesso">Ativo</Etiqueta>
          ) : (
            <Etiqueta tom="inativo">Inativo</Etiqueta>
          ),
      }),
    ],
    [lista, abrir, aba],
  );

  return (
    <ListaCadastro
      titulo="Classificação dos exames"
      totalNoTitulo={false}
      abas={
        <Abas
          aria-label="Listas do catálogo"
          valor={aba}
          onMudar={(valor) => ir(() => ({ aba: valor as AbaLista }))}
          abas={ABAS_LISTAS.map((valor) => ({ valor, rotulo: LISTAS[valor].rotuloAba }))}
        />
      }
      novo={
        podeEditar
          ? {
              rotulo: `${lista.rotulos.genero === 'f' ? 'Nova' : 'Novo'} ${lista.rotulos.singular}`,
              onClick: () => ir((atual) => ({ ...atual, id: undefined, novo: 1 })),
            }
          : undefined
      }
      busca={{
        valor: busca.busca,
        rotulo: `Buscar ${lista.plural}`,
        placeholder: 'Nome ou descrição',
      }}
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
      colunas={colunas}
      ocultarComPainel={['descricao', 'ordem', 'variacoes']}
      itens={pagina.itens}
      getRowId={(item) => item.id}
      selecionadoId={busca.id}
      onAbrir={abrir}
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: `Nenhum${lista.rotulos.genero === 'f' ? 'a' : ''} ${lista.rotulos.singular} cadastrad${lista.rotulos.genero === 'f' ? 'a' : 'o'}.`,
        texto: podeEditar
          ? `Cadastre ${lista.rotulos.genero === 'f' ? 'a primeira' : 'o primeiro'} para usar nos exames e na importação.`
          : 'Quem administra o catálogo cadastra os itens.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() => filtrar({ busca: undefined, situacao: undefined })}
      onIrPara={(numero) => ir((atual) => ({ ...atual, pagina: numero }))}
      painel={
        // Só com um painel aberto: no celular, a lista some quando há painel.
        busca.id || (busca.novo && podeEditar) ? (
          <PainelDoItem
            key={`${aba}:${busca.id ?? 'novo'}`}
            aba={aba}
            id={busca.id}
            podeEditar={podeEditar}
          />
        ) : undefined
      }
    />
  );
}

function PainelDoItem({
  aba,
  id,
  podeEditar,
}: {
  aba: AbaLista;
  id?: string;
  podeEditar: boolean;
}) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const lista = LISTAS[aba];
  const { data: opcoes } = useSuspenseQuery(opcoesControllerListasQueryOptions());
  const fechar = () =>
    void navigate({ search: (atual) => ({ ...atual, id: undefined, novo: undefined }) });

  return (
    <ConteudoDoPainel
      aba={aba}
      id={id}
      podeEditar={podeEditar}
      especialidades={opcoes.especialidades}
      onFechar={fechar}
      onSalvo={async (novoId) => {
        await invalidarCatalogo(queryClient);
        void navigate({
          search: (atual) => ({ ...atual, novo: undefined, id: novoId }),
          replace: true,
        });
      }}
      onExcluido={async () => {
        fechar();
        await invalidarCatalogo(queryClient);
      }}
      lista={lista}
    />
  );
}

function ConteudoDoPainel({
  aba,
  id,
  lista,
  podeEditar,
  especialidades,
  onFechar,
  onSalvo,
  onExcluido,
}: {
  aba: AbaLista;
  id?: string;
  lista: (typeof LISTAS)[AbaLista];
  podeEditar: boolean;
  especialidades: { id: string; nome: string }[];
  onFechar: () => void;
  onSalvo: (id: string) => Promise<void>;
  onExcluido: () => Promise<void>;
}) {
  const consulta = useQuery({ ...lista.obter(id ?? ''), enabled: Boolean(id) } as ReturnType<
    typeof lista.obter
  >);
  const item = id ? (consulta.data as unknown as ItemDaLista | undefined) : undefined;
  if (id && !item)
    return (
      <PainelCarregando
        onFechar={onFechar}
        erro={consulta.isError}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );
  return (
    <PainelItemLista
      rotulos={lista.rotulos}
      variante={lista.variante}
      item={item}
      especialidades={aba === 'subespecialidades' ? especialidades : []}
      podeEditar={podeEditar}
      onFechar={onFechar}
      onSalvar={async (dados) => {
        if (id) {
          await lista.atualizar(id, dados);
          await onSalvo(id);
        } else {
          const criado = (await lista.criar(dados)) as { id: string };
          await onSalvo(criado.id);
        }
      }}
      onExcluir={
        id
          ? async () => {
              await lista.excluir(id);
              await onExcluido();
            }
          : undefined
      }
    >
      {/* Prioridade e especialidade são a forma certa; as variações chegam da MobileMed. */}
      {item && (aba === 'prioridades' || aba === 'especialidades') && (
        <VariacoesDoItem aba={aba} id={item.id} forma={item.nome} />
      )}
    </PainelItemLista>
  );
}

const TIPOS_VARIACAO_ESPECIALIDADE = [
  {
    valor: 'normalizacao',
    rotulo: 'Grafia da especialidade',
    ajuda: 'Outra forma de escrever a especialidade (ex.: MAMO).',
  },
  {
    valor: 'regiao_anatomica',
    rotulo: 'Região anatômica',
    ajuda: 'Parte do corpo que chega no campo especialidade (ex.: JOELHO); comparada sem acento.',
  },
];

/** Variações da prioridade ou da especialidade (os de-paras que apontam para ela). */
function VariacoesDoItem({
  aba,
  id,
  forma,
}: {
  aba: 'prioridades' | 'especialidades';
  id: string;
  forma: string;
}) {
  const { sessao } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const prioridade = aba === 'prioridades';
  const consulta = useQuery({
    ...((prioridade
      ? deParaPrioridadesControllerListarQueryOptions({
          query: { prioridadeId: id, porPagina: 100 },
        })
      : deParaEspecialidadesControllerListarQueryOptions({
          query: { especialidadeId: id, porPagina: 100 },
        })) as ReturnType<typeof deParaPrioridadesControllerListarQueryOptions>),
    enabled: pode(sessao, 'de-para.ver'),
  });
  if (!pode(sessao, 'de-para.ver')) return null;
  if (!consulta.data) return <CamposCarregando quantidade={2} />;

  return (
    <VariacoesForma
      forma={forma}
      variacoes={consulta.data.itens as unknown as Variacao[]}
      tipos={prioridade ? undefined : TIPOS_VARIACAO_ESPECIALIDADE}
      podeEditar={pode(sessao, 'de-para.editar')}
      onAdicionar={async ({ origem, tipo }) => {
        if (prioridade) {
          await deParaPrioridadesControllerCriar({
            body: { origem, prioridadeId: id, ativo: true },
          }).unwrap();
        } else {
          await deParaEspecialidadesControllerCriar({
            body: {
              tipo: (tipo ?? 'normalizacao') as 'normalizacao' | 'regiao_anatomica',
              origem,
              especialidadeId: id,
              ativo: true,
              observacoes: null,
            },
          }).unwrap();
        }
        await invalidarCatalogo(queryClient);
      }}
      onRemover={async (variacaoId) => {
        if (prioridade) {
          await deParaPrioridadesControllerExcluir({ path: { id: variacaoId } }).unwrap();
        } else {
          await deParaEspecialidadesControllerExcluir({ path: { id: variacaoId } }).unwrap();
        }
        await invalidarCatalogo(queryClient);
      }}
    />
  );
}
