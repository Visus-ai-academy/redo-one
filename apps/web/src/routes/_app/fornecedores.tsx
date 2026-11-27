import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { ListaCadastro } from '../../components/cadastro/ListaCadastro';
import { createDataTableColumnHelper } from '../../components/data-table/columns';
import { LinkDaLinha } from '../../components/data-table/link-da-linha';
import { SemPermissao } from '../../components/estado/estados';
import { Etiqueta } from '../../components/etiqueta/Etiqueta';
import { PainelFornecedor } from '../../components/financeiro/PainelFornecedor';
import { TitulosDoFornecedor } from '../../components/financeiro/TitulosDoFornecedor';
import { HistoricoCadastro } from '../../components/historico-cadastro/HistoricoCadastro';
import { PainelCarregando } from '../../components/painel/PainelCarregando';
import { Select } from '../../components/select/Select';
import { useFaseDoCarregamento } from '../../components/skeleton/use-fase-do-carregamento';
import { useAvisos } from '../../components/toast/use-avisos';
import { fornecedoresControllerAtualizar } from '../../gen/clients/fornecedoresControllerAtualizar';
import { fornecedoresControllerCriar } from '../../gen/clients/fornecedoresControllerCriar';
import { fornecedoresControllerExcluir } from '../../gen/clients/fornecedoresControllerExcluir';
import { categoriasFinanceirasControllerOpcoesQueryOptions } from '../../gen/hooks/useCategoriasFinanceirasControllerOpcoes';
import { fornecedoresControllerListarQueryOptions } from '../../gen/hooks/useFornecedoresControllerListar';
import { fornecedoresControllerObterQueryOptions } from '../../gen/hooks/useFornecedoresControllerObter';
import type { FornecedorItemDto } from '../../gen/types/FornecedorItemDto';
import { cpfMascarado } from '../../lib/cpf';
import { formatarCnpj } from '../../lib/documentos';
import { invalidarFinanceiro, rotuloDaCategoria } from '../../lib/financeiro';
import { type PodeNaTela, pode, podeNaTela } from '../../lib/permissoes';

const POR_PAGINA = 25;
const TELA = 'fornecedores';
const TODAS = 'todas';

const buscaSchema = z.object({
  busca: z.string().trim().min(1).optional().catch(undefined),
  situacao: z.enum(['ativas', 'inativas']).optional().catch(undefined),
  categoria: z.uuid().optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
  novo: z.literal(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

// Sem situação ou categoria na URL, a escolha é "Todas", mandada explicitamente à API.
const consulta = (busca: Busca) => ({
  query: {
    situacao: busca.situacao ?? ('todas' as const),
    categoria: busca.categoria ?? TODAS,
    busca: busca.busca,
    pagina: busca.pagina ?? 1,
    porPagina: POR_PAGINA,
  },
});
const opcoesDespesa = () =>
  categoriasFinanceirasControllerOpcoesQueryOptions({ query: { tipo: 'despesa' } });

export const Route = createFileRoute('/_app/fornecedores')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    if (!pode(context.sessao, `${TELA}.ver`)) return;
    if (deps.id)
      void context.queryClient.prefetchQuery(
        fornecedoresControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    await Promise.all([
      cause !== 'stay' &&
        context.queryClient.ensureQueryData(
          fornecedoresControllerListarQueryOptions(consulta(deps)),
        ),
      context.queryClient.ensureQueryData(opcoesDespesa()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Fornecedores · One' }] }),
  component: PaginaFornecedores,
});

function PaginaFornecedores() {
  const { sessao } = Route.useRouteContext();
  return pode(sessao, `${TELA}.ver`) ? (
    <Fornecedores
      permissoes={podeNaTela(sessao, TELA)}
      podeVerTitulos={pode(sessao, 'contas-pagar.ver')}
    />
  ) : (
    <SemPermissao tela="Fornecedores" />
  );
}

const coluna = createDataTableColumnHelper<FornecedorItemDto>();
const colunas = [
  coluna.accessor('razaoSocial', {
    header: 'Nome',
    cell: (info) => (
      <span className="flex min-w-0 flex-col">
        <LinkDaLinha
          from={Route.fullPath}
          to="."
          search={(a: Busca) => ({ ...a, id: info.row.original.id, novo: undefined })}
        >
          {info.getValue()}
        </LinkDaLinha>
        {info.row.original.nomeFantasia && (
          <span className="text-muted-foreground text-[13px]">
            {info.row.original.nomeFantasia}
          </span>
        )}
      </span>
    ),
  }),
  coluna.accessor(
    (f) => (f.tipoPessoa === 'PJ' ? formatarCnpj(f.cnpj) : cpfMascarado(f.cpfFinal)),
    {
      id: 'documento',
      header: 'CNPJ/CPF',
      cell: (info) => <span className="whitespace-nowrap tabular-nums">{info.getValue()}</span>,
    },
  ),
  coluna.accessor('categoriaPadraoNome', {
    header: 'Categoria padrão',
    cell: (info) => <span className="text-muted-foreground">{info.getValue() ?? '—'}</span>,
  }),
  coluna.accessor('ativo', {
    header: 'Situação',
    cell: (info) =>
      info.getValue() ? (
        <Etiqueta tom="sucesso">Ativo</Etiqueta>
      ) : (
        <Etiqueta tom="inativo">Inativo</Etiqueta>
      ),
  }),
];

function Fornecedores({
  permissoes,
  podeVerTitulos,
}: {
  permissoes: PodeNaTela;
  podeVerTitulos: boolean;
}) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const lista = useQuery({
    ...fornecedoresControllerListarQueryOptions(consulta(busca)),
    placeholderData: keepPreviousData,
  });
  const categorias = useQuery(opcoesDespesa());
  const pagina = lista.data ?? { itens: [], pagina: 1, porPagina: POR_PAGINA, total: 0 };

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const filtrar = useCallback(
    (novos: Partial<Busca>) => ir((atual) => ({ ...atual, ...novos, pagina: undefined }), true),
    [ir],
  );
  const opcoesCategoria = useMemo(
    () => [
      { valor: TODAS, rotulo: 'Todas as categorias' },
      ...(categorias.data ?? []).map((c) => ({ valor: c.id, rotulo: rotuloDaCategoria(c) })),
    ],
    [categorias.data],
  );

  return (
    <ListaCadastro
      titulo="Fornecedores"
      novo={
        permissoes.criar
          ? {
              rotulo: 'Novo fornecedor',
              onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })),
            }
          : undefined
      }
      busca={{
        valor: busca.busca,
        rotulo: 'Buscar fornecedores',
        placeholder: 'Nome, CNPJ ou CPF',
      }}
      temFiltro={busca.situacao !== undefined || busca.categoria !== undefined}
      filtros={
        <>
          <Select
            aria-label="Filtrar por situação"
            value={busca.situacao ?? 'todas'}
            onValueChange={(valor) =>
              filtrar({ situacao: valor === 'todas' ? undefined : (valor as Busca['situacao']) })
            }
            opcoes={[
              { valor: 'todas', rotulo: 'Todas as situações' },
              { valor: 'ativas', rotulo: 'Ativos' },
              { valor: 'inativas', rotulo: 'Inativos' },
            ]}
            className="flex-[1_1_180px] md:flex-[0_1_200px]"
          />
          <Select
            aria-label="Filtrar por categoria padrão"
            value={busca.categoria ?? TODAS}
            onValueChange={(valor) => filtrar({ categoria: valor === TODAS ? undefined : valor })}
            opcoes={opcoesCategoria}
            className="flex-[1_1_200px] md:flex-[0_1_260px]"
          />
        </>
      }
      colunas={colunas}
      itens={pagina.itens}
      getRowId={(f) => f.id}
      selecionadoId={busca.id}
      recarregando={lista.isPlaceholderData}
      erro={
        lista.isError && !lista.data
          ? {
              erro: lista.error,
              oQue: 'os fornecedores',
              onTentarDeNovo: () => void lista.refetch(),
            }
          : undefined
      }
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhum fornecedor cadastrado.',
        texto: permissoes.criar
          ? 'Cadastre a quem a empresa paga e que não é médico: aluguel, software, contabilidade...'
          : 'Quem administra o financeiro cadastra os fornecedores.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() =>
        filtrar({ busca: undefined, situacao: undefined, categoria: undefined })
      }
      onIrPara={(numero) => ir((a) => ({ ...a, pagina: numero }))}
      painel={
        busca.id || (busca.novo && permissoes.criar) ? (
          <Painel
            key={busca.id ?? 'novo'}
            id={busca.id}
            permissoes={permissoes}
            podeVerTitulos={podeVerTitulos}
          />
        ) : undefined
      }
    />
  );
}

function Painel({
  id,
  permissoes,
  podeVerTitulos,
}: {
  id?: string;
  permissoes: PodeNaTela;
  podeVerTitulos: boolean;
}) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const categorias = useQuery(opcoesDespesa());
  const consultaItem = useQuery({
    ...fornecedoresControllerObterQueryOptions({ path: { id: id ?? '' } }),
    enabled: Boolean(id),
  });
  const fornecedor = consultaItem.data;
  const { sucesso } = useAvisos();
  const carregando = (Boolean(id) && !fornecedor) || !categorias.data;
  const fase = useFaseDoCarregamento(carregando);
  const fechar = () => void navigate({ search: (a) => ({ ...a, id: undefined, novo: undefined }) });
  if (carregando || fase !== 'conteudo')
    return (
      <PainelCarregando
        onFechar={fechar}
        erro={consultaItem.error ?? categorias.error ?? undefined}
        oQue="o fornecedor"
        voltar={{ to: '/fornecedores', rotulo: 'Voltar para Fornecedores' }}
        onTentarDeNovo={() => {
          void consultaItem.refetch();
          void categorias.refetch();
        }}
      />
    );

  return (
    <PainelFornecedor
      fornecedor={fornecedor}
      categorias={categorias.data ?? []}
      podeEditar={id ? permissoes.editar : permissoes.criar}
      onFechar={fechar}
      historico={id ? <HistoricoCadastro key={id} cadastro="fornecedor" id={id} /> : undefined}
      titulos={
        id && fornecedor ? (
          <TitulosDoFornecedor id={id} nome={fornecedor.razaoSocial} podeVer={podeVerTitulos} />
        ) : undefined
      }
      onSalvar={async (dados) => {
        let alvo = id;
        if (id) await fornecedoresControllerAtualizar({ path: { id }, body: dados }).unwrap();
        else alvo = (await fornecedoresControllerCriar({ body: dados }).unwrap()).id;
        await invalidarFinanceiro(queryClient);
        sucesso(id ? 'Fornecedor salvo.' : 'Fornecedor criado.');
        void navigate({ search: (a) => ({ ...a, novo: undefined, id: alvo }), replace: true });
      }}
      onExcluir={
        id && permissoes.excluir
          ? async () => {
              await fornecedoresControllerExcluir({ path: { id } }).unwrap();
              fechar();
              sucesso('Fornecedor excluído.');
              await invalidarFinanceiro(queryClient);
            }
          : undefined
      }
    />
  );
}
