import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactNode, useCallback, useMemo } from 'react';
import { z } from 'zod';

import { ListaCadastro } from '../../../components/cadastro/ListaCadastro';
import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { createDataTableColumnHelper } from '../../../components/data-table/columns';
import { LinkDaLinha } from '../../../components/data-table/link-da-linha';
import { SemPermissao } from '../../../components/estado/estados';
import { Etiqueta } from '../../../components/etiqueta/Etiqueta';
import { PainelContaBancaria } from '../../../components/financeiro/PainelContaBancaria';
import { PainelCarregando } from '../../../components/painel/PainelCarregando';
import { Select } from '../../../components/select/Select';
import { useFaseDoCarregamento } from '../../../components/skeleton/use-fase-do-carregamento';
import { useAvisos } from '../../../components/toast/use-avisos';
import { contasBancariasControllerAtualizar } from '../../../gen/clients/contasBancariasControllerAtualizar';
import { contasBancariasControllerCriar } from '../../../gen/clients/contasBancariasControllerCriar';
import { contasBancariasControllerExcluir } from '../../../gen/clients/contasBancariasControllerExcluir';
import { contasBancariasControllerListarQueryOptions } from '../../../gen/hooks/useContasBancariasControllerListar';
import { contasBancariasControllerObterQueryOptions } from '../../../gen/hooks/useContasBancariasControllerObter';
import { empresasFinanceiroControllerListarQueryOptions } from '../../../gen/hooks/useEmpresasFinanceiroControllerListar';
import type { ContaBancariaItemDto } from '../../../gen/types/ContaBancariaItemDto';
import { contaPorExtenso, invalidarFinanceiro } from '../../../lib/financeiro';
import { moeda } from '../../../lib/formato';
import { type PodeNaTela, pode, podeNaTela } from '../../../lib/permissoes';

const POR_PAGINA = 25;
const TELA = 'contas-bancarias';
const TODAS = 'todas';

const buscaSchema = z.object({
  busca: z.string().trim().min(1).optional().catch(undefined),
  empresa: z.uuid().optional().catch(undefined),
  situacao: z.enum(['ativas', 'inativas']).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
  novo: z.literal(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

// Sem empresa ou situação na URL, a escolha é "Todas", mandada explicitamente à API.
const consulta = (busca: Busca) => ({
  query: {
    empresa: busca.empresa ?? TODAS,
    situacao: busca.situacao ?? ('todas' as const),
    busca: busca.busca,
    pagina: busca.pagina ?? 1,
    porPagina: POR_PAGINA,
  },
});

export const Route = createFileRoute('/_app/configuracoes/contas-bancarias')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    if (!pode(context.sessao, `${TELA}.ver`)) return;
    if (deps.id)
      void context.queryClient.prefetchQuery(
        contasBancariasControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    await Promise.all([
      cause !== 'stay' &&
        context.queryClient.ensureQueryData(
          contasBancariasControllerListarQueryOptions(consulta(deps)),
        ),
      context.queryClient.ensureQueryData(empresasFinanceiroControllerListarQueryOptions()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Contas bancárias · One' }] }),
  component: PaginaContasBancarias,
});

function PaginaContasBancarias() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, `${TELA}.ver`) ? (
        <ContasBancarias permissoes={podeNaTela(sessao, TELA)} />
      ) : (
        <SemPermissao tela="Contas bancárias" />
      )}
    </ConfiguracoesLayout>
  );
}

const coluna = createDataTableColumnHelper<ContaBancariaItemDto>();
const direita = (conteudo: ReactNode) => <span className="block text-right">{conteudo}</span>;

const colunas = [
  coluna.accessor('apelido', {
    header: 'Apelido',
    cell: (info) => (
      <span className="flex flex-wrap items-center gap-2">
        <LinkDaLinha
          from={Route.fullPath}
          to="."
          search={(a: Busca) => ({ ...a, id: info.row.original.id, novo: undefined })}
        >
          {info.getValue()}
        </LinkDaLinha>
        {info.row.original.padraoRecebimento && <Etiqueta tom="info">Padrão</Etiqueta>}
      </span>
    ),
  }),
  coluna.accessor('empresaNome', {
    header: 'Empresa',
    cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
  }),
  coluna.accessor((c) => contaPorExtenso(c), {
    id: 'conta',
    header: 'Banco · agência · conta',
    cell: (info) => <span className="whitespace-nowrap tabular-nums">{info.getValue()}</span>,
  }),
  coluna.accessor('saldoPeloOneCentavos', {
    header: () => direita('Saldo pelo One'),
    cell: (info) =>
      direita(
        <span className="whitespace-nowrap tabular-nums">{moeda(info.getValue() / 100)}</span>,
      ),
  }),
  coluna.accessor('integracao', {
    header: 'Integração',
    cell: (info) =>
      info.getValue() === 'itau' ? 'Itaú' : <span className="text-muted-foreground">Nenhuma</span>,
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
];

function ContasBancarias({ permissoes }: { permissoes: PodeNaTela }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const lista = useQuery({
    ...contasBancariasControllerListarQueryOptions(consulta(busca)),
    placeholderData: keepPreviousData,
  });
  const empresas = useQuery(empresasFinanceiroControllerListarQueryOptions());
  const pagina = lista.data ?? { itens: [], pagina: 1, porPagina: POR_PAGINA, total: 0 };

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const filtrar = useCallback(
    (novos: Partial<Busca>) => ir((atual) => ({ ...atual, ...novos, pagina: undefined }), true),
    [ir],
  );
  const opcoesEmpresa = useMemo(
    () => [
      { valor: TODAS, rotulo: 'Todas as empresas' },
      ...(empresas.data ?? []).map((e) => ({ valor: e.id, rotulo: e.nome })),
    ],
    [empresas.data],
  );

  return (
    <ListaCadastro
      titulo="Contas bancárias"
      novo={
        permissoes.criar
          ? {
              rotulo: 'Nova conta',
              onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })),
            }
          : undefined
      }
      busca={{
        valor: busca.busca,
        rotulo: 'Buscar contas bancárias',
        placeholder: 'Apelido, banco, agência ou conta',
      }}
      temFiltro={busca.empresa !== undefined || busca.situacao !== undefined}
      filtros={
        <>
          <Select
            aria-label="Filtrar por empresa"
            value={busca.empresa ?? TODAS}
            onValueChange={(valor) => filtrar({ empresa: valor === TODAS ? undefined : valor })}
            opcoes={opcoesEmpresa}
            className="flex-[1_1_200px] md:flex-[0_1_240px]"
          />
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
        </>
      }
      colunas={colunas}
      itens={pagina.itens}
      getRowId={(c) => c.id}
      selecionadoId={busca.id}
      recarregando={lista.isPlaceholderData}
      erro={
        lista.isError && !lista.data
          ? {
              erro: lista.error,
              oQue: 'as contas bancárias',
              onTentarDeNovo: () => void lista.refetch(),
            }
          : undefined
      }
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhuma conta bancária cadastrada.',
        texto: permissoes.criar
          ? 'Cadastre as contas onde o dinheiro de cada empresa entra e sai.'
          : 'Quem administra o financeiro cadastra as contas bancárias.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() => filtrar({ busca: undefined, empresa: undefined, situacao: undefined })}
      onIrPara={(numero) => ir((a) => ({ ...a, pagina: numero }))}
      painel={
        busca.id || (busca.novo && permissoes.criar) ? (
          <Painel key={busca.id ?? 'novo'} id={busca.id} permissoes={permissoes} />
        ) : undefined
      }
    />
  );
}

function Painel({ id, permissoes }: { id?: string; permissoes: PodeNaTela }) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const empresas = useQuery(empresasFinanceiroControllerListarQueryOptions());
  const consultaItem = useQuery({
    ...contasBancariasControllerObterQueryOptions({ path: { id: id ?? '' } }),
    enabled: Boolean(id),
  });
  const conta = consultaItem.data;
  const { sucesso } = useAvisos();
  const carregando = (Boolean(id) && !conta) || !empresas.data;
  const fase = useFaseDoCarregamento(carregando);
  const fechar = () => void navigate({ search: (a) => ({ ...a, id: undefined, novo: undefined }) });
  if (carregando || fase !== 'conteudo')
    return (
      <PainelCarregando
        onFechar={fechar}
        erro={consultaItem.error ?? empresas.error ?? undefined}
        oQue="a conta bancária"
        voltar={{ to: '/configuracoes/contas-bancarias', rotulo: 'Voltar para Contas bancárias' }}
        onTentarDeNovo={() => {
          void consultaItem.refetch();
          void empresas.refetch();
        }}
      />
    );

  return (
    <PainelContaBancaria
      conta={conta}
      empresas={empresas.data ?? []}
      podeEditar={id ? permissoes.editar : permissoes.criar}
      onFechar={fechar}
      onSalvar={async (dados) => {
        let alvo = id;
        if (id) await contasBancariasControllerAtualizar({ path: { id }, body: dados }).unwrap();
        else alvo = (await contasBancariasControllerCriar({ body: dados }).unwrap()).id;
        await invalidarFinanceiro(queryClient);
        sucesso(id ? 'Conta salva.' : 'Conta criada.');
        void navigate({ search: (a) => ({ ...a, novo: undefined, id: alvo }), replace: true });
      }}
      onExcluir={
        id && permissoes.excluir
          ? async () => {
              await contasBancariasControllerExcluir({ path: { id } }).unwrap();
              fechar();
              sucesso('Conta excluída.');
              await invalidarFinanceiro(queryClient);
            }
          : undefined
      }
    />
  );
}
