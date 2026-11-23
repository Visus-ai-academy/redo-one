import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { ListaCadastro } from '../../../components/cadastro/ListaCadastro';
import { PainelContratado } from '../../../components/catalogo/PainelContratado';
import { ConfiguracoesLayout } from '../../../components/configuracoes/ConfiguracoesLayout';
import { createDataTableColumnHelper } from '../../../components/data-table/columns';
import { LinkDaLinha } from '../../../components/data-table/link-da-linha';
import { SemPermissao } from '../../../components/estado/estados';
import { Etiqueta } from '../../../components/etiqueta/Etiqueta';
import { PainelCarregando } from '../../../components/painel/PainelCarregando';
import { Select } from '../../../components/select/Select';
import { useFaseDoCarregamento } from '../../../components/skeleton/use-fase-do-carregamento';
import { useAvisos } from '../../../components/toast/use-avisos';
import { contratadosControllerAtualizar } from '../../../gen/clients/contratadosControllerAtualizar';
import { contratadosControllerCriar } from '../../../gen/clients/contratadosControllerCriar';
import { contratadosControllerExcluir } from '../../../gen/clients/contratadosControllerExcluir';
import { contratadosControllerListarQueryOptions } from '../../../gen/hooks/useContratadosControllerListar';
import { contratadosControllerObterQueryOptions } from '../../../gen/hooks/useContratadosControllerObter';
import { opcoesControllerListasQueryOptions } from '../../../gen/hooks/useOpcoesControllerListas';
import type { ContratadoItemDto } from '../../../gen/types/ContratadoItemDto';
import { invalidarCatalogo } from '../../../lib/catalogo';
import { formatarCnpj } from '../../../lib/documentos';
import { type PodeNaTela, pode, podeNaTela } from '../../../lib/permissoes';

const POR_PAGINA = 25;

const buscaSchema = z.object({
  busca: z.string().trim().min(1).optional().catch(undefined),
  situacao: z.enum(['ativos', 'inativos']).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
  novo: z.literal(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const consulta = (busca: Busca) => ({
  query: {
    busca: busca.busca,
    ativo: busca.situacao === undefined ? undefined : busca.situacao === 'ativos',
    pagina: busca.pagina ?? 1,
    porPagina: POR_PAGINA,
  },
});

export const Route = createFileRoute('/_app/configuracoes/contratados')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    if (!pode(context.sessao, 'catalogo.ver')) return;
    // O item vem depois: o painel abre na hora, com o skeleton, enquanto ele carrega.
    if (deps.id)
      void context.queryClient.prefetchQuery(
        contratadosControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    await Promise.all([
      // Na própria tela (filtro, página, painel), a lista busca sozinha e deixa a de antes à
      // vista, esmaecida, enquanto isso.
      cause !== 'stay' &&
        context.queryClient.ensureQueryData(
          contratadosControllerListarQueryOptions(consulta(deps)),
        ),
      context.queryClient.ensureQueryData(opcoesControllerListasQueryOptions()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Contratados · One' }] }),
  component: PaginaContratados,
});

function PaginaContratados() {
  const { sessao } = Route.useRouteContext();
  return (
    <ConfiguracoesLayout acesso={sessao}>
      {pode(sessao, 'catalogo.ver') ? (
        <Contratados permissoes={podeNaTela(sessao, 'catalogo')} />
      ) : (
        <SemPermissao tela="Contratados" />
      )}
    </ConfiguracoesLayout>
  );
}

const coluna = createDataTableColumnHelper<ContratadoItemDto>();
function Contratados({ permissoes }: { permissoes: PodeNaTela }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const lista = useQuery({
    ...contratadosControllerListarQueryOptions(consulta(busca)),
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

  const colunas = useMemo(
    () => [
      coluna.accessor('razaoSocial', {
        header: 'Razão social',
        cell: (info) => (
          <LinkDaLinha
            from={Route.fullPath}
            to="."
            search={(a: Busca) => ({ ...a, id: info.row.original.id, novo: undefined })}
          >
            {info.getValue()}
          </LinkDaLinha>
        ),
      }),
      coluna.accessor('cnpj', {
        header: 'CNPJ',
        cell: (info) => <span className="whitespace-nowrap">{formatarCnpj(info.getValue())}</span>,
      }),
      coluna.accessor((c) => [c.cidade, c.uf].filter(Boolean).join(' / ') || '—', {
        id: 'cidade',
        header: 'Cidade',
      }),
      coluna.accessor('contratadoRepasseNome', {
        header: 'Consolida o repasse em',
        cell: (info) => (
          <span className="text-muted-foreground">{info.getValue() ?? 'Nele mesmo'}</span>
        ),
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
    ],
    [],
  );

  return (
    <ListaCadastro
      titulo="Contratados"
      novo={
        permissoes.criar
          ? {
              rotulo: 'Novo contratado',
              onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })),
            }
          : undefined
      }
      busca={{
        valor: busca.busca,
        rotulo: 'Buscar contratados',
        placeholder: 'Razão social ou CNPJ',
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
      itens={pagina.itens}
      getRowId={(c) => c.id}
      selecionadoId={busca.id}
      recarregando={lista.isPlaceholderData}
      erro={
        lista.isError && !lista.data
          ? {
              erro: lista.error,
              oQue: 'os contratados',
              onTentarDeNovo: () => void lista.refetch(),
            }
          : undefined
      }
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhum contratado cadastrado.',
        texto: permissoes.criar
          ? 'Cadastre as empresas que emitem a nota (ex.: 001 Teleimagem) antes dos clientes.'
          : 'Quem administra o catálogo cadastra os contratados.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() => filtrar({ busca: undefined, situacao: undefined })}
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
  const { data: opcoes } = useSuspenseQuery(opcoesControllerListasQueryOptions());
  const consulta = useQuery({
    ...contratadosControllerObterQueryOptions({ path: { id: id ?? '' } }),
    enabled: Boolean(id),
  });
  const contratado = consulta.data;
  const { sucesso } = useAvisos();
  const fase = useFaseDoCarregamento(Boolean(id) && !contratado);
  const fechar = () => void navigate({ search: (a) => ({ ...a, id: undefined, novo: undefined }) });
  if (id && (!contratado || fase !== 'conteudo'))
    return (
      <PainelCarregando
        onFechar={fechar}
        erro={consulta.error ?? undefined}
        oQue="o contratado"
        voltar={{ to: '/configuracoes/contratados', rotulo: 'Voltar para Contratados' }}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );

  return (
    <PainelContratado
      contratado={contratado}
      contratados={opcoes.contratados}
      podeEditar={id ? permissoes.editar : permissoes.criar}
      onFechar={fechar}
      onSalvar={async (dados) => {
        let alvo = id;
        if (id) await contratadosControllerAtualizar({ path: { id }, body: dados }).unwrap();
        else alvo = (await contratadosControllerCriar({ body: dados }).unwrap()).id;
        await invalidarCatalogo(queryClient);
        sucesso(id ? 'Contratado salvo.' : 'Contratado criado.');
        void navigate({ search: (a) => ({ ...a, novo: undefined, id: alvo }), replace: true });
      }}
      onExcluir={
        id && permissoes.excluir
          ? async () => {
              await contratadosControllerExcluir({ path: { id } }).unwrap();
              fechar();
              sucesso('Contratado excluído.');
              await invalidarCatalogo(queryClient);
            }
          : undefined
      }
    />
  );
}
