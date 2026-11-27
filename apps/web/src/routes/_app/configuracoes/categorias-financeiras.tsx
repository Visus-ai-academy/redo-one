import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { Abas } from '../../../components/abas/Abas';
import { ListaCadastro } from '../../../components/cadastro/ListaCadastro';
import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { createDataTableColumnHelper } from '../../../components/data-table/columns';
import { LinkDaLinha } from '../../../components/data-table/link-da-linha';
import { SemPermissao } from '../../../components/estado/estados';
import { Etiqueta } from '../../../components/etiqueta/Etiqueta';
import { PainelCategoria } from '../../../components/financeiro/PainelCategoria';
import { PainelCarregando } from '../../../components/painel/PainelCarregando';
import { Select } from '../../../components/select/Select';
import { useFaseDoCarregamento } from '../../../components/skeleton/use-fase-do-carregamento';
import { useAvisos } from '../../../components/toast/use-avisos';
import { categoriasFinanceirasControllerAtualizar } from '../../../gen/clients/categoriasFinanceirasControllerAtualizar';
import { categoriasFinanceirasControllerCriar } from '../../../gen/clients/categoriasFinanceirasControllerCriar';
import { categoriasFinanceirasControllerExcluir } from '../../../gen/clients/categoriasFinanceirasControllerExcluir';
import { categoriasFinanceirasControllerListarQueryOptions } from '../../../gen/hooks/useCategoriasFinanceirasControllerListar';
import { categoriasFinanceirasControllerObterQueryOptions } from '../../../gen/hooks/useCategoriasFinanceirasControllerObter';
import { categoriasFinanceirasControllerOpcoesQueryOptions } from '../../../gen/hooks/useCategoriasFinanceirasControllerOpcoes';
import type { CategoriaItemDto } from '../../../gen/types/CategoriaItemDto';
import { invalidarFinanceiro } from '../../../lib/financeiro';
import { type PodeNaTela, pode, podeNaTela } from '../../../lib/permissoes';

const POR_PAGINA = 25;
const TELA = 'categorias-financeiras';

const ABAS = [
  { valor: 'receitas', rotulo: 'Receitas', tipo: 'receita' },
  { valor: 'despesas', rotulo: 'Despesas', tipo: 'despesa' },
] as const;
type AbaCategorias = (typeof ABAS)[number]['valor'];

const buscaSchema = z.object({
  aba: z.enum(['receitas', 'despesas']).optional().catch(undefined),
  busca: z.string().trim().min(1).optional().catch(undefined),
  situacao: z.enum(['todas', 'ativas', 'inativas']).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
  novo: z.literal(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const tipoDaAba = (aba: AbaCategorias | undefined) =>
  aba === 'despesas' ? ('despesa' as const) : ('receita' as const);

const consulta = (busca: Busca) => ({
  query: {
    tipo: tipoDaAba(busca.aba),
    situacao: busca.situacao ?? ('todas' as const),
    busca: busca.busca,
    pagina: busca.pagina ?? 1,
    porPagina: POR_PAGINA,
  },
});

export const Route = createFileRoute('/_app/configuracoes/categorias-financeiras')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    if (!pode(context.sessao, `${TELA}.ver`)) return;
    // O item vem depois: o painel abre na hora, com o skeleton, enquanto ele carrega.
    if (deps.id)
      void context.queryClient.prefetchQuery(
        categoriasFinanceirasControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    await Promise.all([
      cause !== 'stay' &&
        context.queryClient.ensureQueryData(
          categoriasFinanceirasControllerListarQueryOptions(consulta(deps)),
        ),
      context.queryClient.ensureQueryData(categoriasFinanceirasControllerOpcoesQueryOptions()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Categorias financeiras · One' }] }),
  component: PaginaCategorias,
});

function PaginaCategorias() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, `${TELA}.ver`) ? (
        <Categorias permissoes={podeNaTela(sessao, TELA)} />
      ) : (
        <SemPermissao tela="Categorias financeiras" />
      )}
    </ConfiguracoesLayout>
  );
}

const coluna = createDataTableColumnHelper<CategoriaItemDto>();

function Categorias({ permissoes }: { permissoes: PodeNaTela }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const aba = busca.aba ?? 'receitas';
  const lista = useQuery({
    ...categoriasFinanceirasControllerListarQueryOptions(consulta(busca)),
    placeholderData: keepPreviousData,
  });
  const pagina = lista.data ?? { itens: [], pagina: 1, porPagina: POR_PAGINA, total: 0 };

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const filtrar = useCallback(
    (novos: Partial<Busca>) => ir((atual) => ({ ...atual, ...novos, pagina: undefined }), true),
    [ir],
  );

  const itens = pagina.itens;
  const colunas = useMemo(
    () => [
      coluna.accessor('nome', {
        header: 'Grupo › categoria',
        cell: (info) => {
          const c = info.row.original;
          // A categoria do grupo fica recuada; se o grupo não está logo acima (outra página ou
          // busca), o nome dele vai na frente.
          const anterior = itens[info.row.index - 1];
          const grupoAcima = anterior && (anterior.id === c.paiId || anterior.paiId === c.paiId);
          return (
            <span className={c.paiId ? 'pl-5' : undefined}>
              {c.paiId && !grupoAcima && (
                <span className="text-muted-foreground">{c.grupoNome} › </span>
              )}
              <LinkDaLinha
                from={Route.fullPath}
                to="."
                search={(a: Busca) => ({ ...a, id: c.id, novo: undefined })}
                // O grupo em destaque; a categoria dentro dele, em peso normal.
                className={c.paiId ? 'font-normal' : 'font-semibold'}
              >
                {c.nome}
              </LinkDaLinha>
            </span>
          );
        },
      }),
      coluna.accessor('codigoContabil', {
        header: 'Código contábil',
        cell: (info) => (
          <span className="text-muted-foreground font-mono text-[13px]">
            {info.getValue() ?? '—'}
          </span>
        ),
      }),
      coluna.accessor('ativa', {
        header: 'Situação',
        cell: (info) =>
          info.getValue() ? (
            <Etiqueta tom="sucesso">Ativa</Etiqueta>
          ) : (
            <Etiqueta tom="inativo">Inativa</Etiqueta>
          ),
      }),
    ],
    [itens],
  );

  const tipo = tipoDaAba(aba);
  return (
    <ListaCadastro
      titulo="Categorias financeiras"
      totalNoTitulo={false}
      abas={
        <Abas
          aria-label="Tipo de categoria"
          valor={aba}
          onMudar={(valor) => ir(() => ({ aba: valor as AbaCategorias }))}
          abas={ABAS.map(({ valor, rotulo }) => ({ valor, rotulo }))}
        />
      }
      novo={
        permissoes.criar
          ? {
              rotulo: 'Nova categoria',
              onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })),
            }
          : undefined
      }
      busca={{
        valor: busca.busca,
        rotulo: 'Buscar categorias',
        placeholder: 'Nome, grupo ou código contábil',
      }}
      temFiltro={(busca.situacao ?? 'todas') !== 'todas'}
      filtros={
        <Select
          aria-label="Filtrar por situação"
          value={busca.situacao ?? 'todas'}
          onValueChange={(valor) =>
            filtrar({ situacao: valor === 'todas' ? undefined : (valor as Busca['situacao']) })
          }
          opcoes={[
            { valor: 'todas', rotulo: 'Todas as situações' },
            { valor: 'ativas', rotulo: 'Ativas' },
            { valor: 'inativas', rotulo: 'Inativas' },
          ]}
          className="flex-[1_1_180px] md:flex-[0_1_200px]"
        />
      }
      colunas={colunas}
      itens={itens}
      getRowId={(c) => c.id}
      selecionadoId={busca.id}
      recarregando={lista.isPlaceholderData}
      erro={
        lista.isError && !lista.data
          ? {
              erro: lista.error,
              oQue: 'as categorias',
              onTentarDeNovo: () => void lista.refetch(),
            }
          : undefined
      }
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo:
          tipo === 'receita'
            ? 'Nenhuma categoria de receita cadastrada.'
            : 'Nenhuma categoria de despesa cadastrada.',
        texto: permissoes.criar
          ? 'Monte o plano em até dois níveis: um grupo (ex.: Ocupação) e as categorias dentro dele (ex.: Aluguel). As mesmas categorias valem para todas as empresas.'
          : 'Quem administra o financeiro cadastra as categorias.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() => filtrar({ busca: undefined, situacao: undefined })}
      onIrPara={(numero) => ir((a) => ({ ...a, pagina: numero }))}
      painel={
        busca.id || (busca.novo && permissoes.criar) ? (
          <Painel key={busca.id ?? 'novo'} id={busca.id} tipo={tipo} permissoes={permissoes} />
        ) : undefined
      }
    />
  );
}

function Painel({
  id,
  tipo,
  permissoes,
}: {
  id?: string;
  tipo: 'receita' | 'despesa';
  permissoes: PodeNaTela;
}) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const opcoes = useQuery(categoriasFinanceirasControllerOpcoesQueryOptions());
  const consultaItem = useQuery({
    ...categoriasFinanceirasControllerObterQueryOptions({ path: { id: id ?? '' } }),
    enabled: Boolean(id),
  });
  const categoria = consultaItem.data;
  const { sucesso } = useAvisos();
  const carregando = (Boolean(id) && !categoria) || !opcoes.data;
  const fase = useFaseDoCarregamento(carregando);
  const fechar = () => void navigate({ search: (a) => ({ ...a, id: undefined, novo: undefined }) });
  if (carregando || fase !== 'conteudo')
    return (
      <PainelCarregando
        onFechar={fechar}
        erro={consultaItem.error ?? opcoes.error ?? undefined}
        oQue="a categoria"
        voltar={{ to: '/configuracoes/categorias-financeiras', rotulo: 'Voltar para Categorias' }}
        onTentarDeNovo={() => {
          void consultaItem.refetch();
          void opcoes.refetch();
        }}
      />
    );

  return (
    <PainelCategoria
      tipo={tipo}
      categoria={categoria}
      grupos={opcoes.data ?? []}
      podeEditar={id ? permissoes.editar : permissoes.criar}
      onFechar={fechar}
      onSalvar={async (dados) => {
        let alvo = id;
        if (id)
          await categoriasFinanceirasControllerAtualizar({ path: { id }, body: dados }).unwrap();
        else alvo = (await categoriasFinanceirasControllerCriar({ body: dados }).unwrap()).id;
        await invalidarFinanceiro(queryClient);
        sucesso(id ? 'Categoria salva.' : 'Categoria criada.');
        void navigate({
          search: (a) => ({
            ...a,
            aba: dados.tipo === 'despesa' ? 'despesas' : 'receitas',
            novo: undefined,
            id: alvo,
          }),
          replace: true,
        });
      }}
      onExcluir={
        id && permissoes.excluir
          ? async () => {
              await categoriasFinanceirasControllerExcluir({ path: { id } }).unwrap();
              fechar();
              sucesso('Categoria excluída.');
              await invalidarFinanceiro(queryClient);
            }
          : undefined
      }
    />
  );
}
