import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';
import { SeloAviso } from '../../components/avisos/SeloAviso';
import { ListaCadastro } from '../../components/cadastro/ListaCadastro';
import { PainelCliente } from '../../components/catalogo/PainelCliente';
import { createDataTableColumnHelper } from '../../components/data-table/columns';
import { LinkDaLinha } from '../../components/data-table/link-da-linha';
import { AbaDistribuicaoCliente } from '../../components/distribuicao/AbaDistribuicaoCliente';
import { SemPermissao } from '../../components/estado/estados';
import { Etiqueta } from '../../components/etiqueta/Etiqueta';
import { DadosFaturamentoCliente } from '../../components/faturamento/dados-faturamento-cliente';
import { EditorCorte } from '../../components/faturamento/editor-corte';
import { EditorTipificacao } from '../../components/faturamento/editor-tipificacao';
import { TabelaPrecos } from '../../components/faturamento/tabela-precos';
import { HistoricoCadastro } from '../../components/historico-cadastro/HistoricoCadastro';
import { PainelCarregando } from '../../components/painel/PainelCarregando';
import { Select } from '../../components/select/Select';
import { useFaseDoCarregamento } from '../../components/skeleton/use-fase-do-carregamento';
import { useAvisos } from '../../components/toast/use-avisos';
import { clientesControllerAdicionarUnidade } from '../../gen/clients/clientesControllerAdicionarUnidade';
import { clientesControllerAtualizar } from '../../gen/clients/clientesControllerAtualizar';
import { clientesControllerCriar } from '../../gen/clients/clientesControllerCriar';
import { clientesControllerCriarAlias } from '../../gen/clients/clientesControllerCriarAlias';
import { clientesControllerExcluir } from '../../gen/clients/clientesControllerExcluir';
import { clientesControllerExcluirAlias } from '../../gen/clients/clientesControllerExcluirAlias';
import { clientesControllerListar } from '../../gen/clients/clientesControllerListar';
import { clientesControllerRemoverUnidade } from '../../gen/clients/clientesControllerRemoverUnidade';
import { clientesControllerListarQueryOptions } from '../../gen/hooks/useClientesControllerListar';
import { clientesControllerObterQueryOptions } from '../../gen/hooks/useClientesControllerObter';
import { opcoesControllerListasQueryOptions } from '../../gen/hooks/useOpcoesControllerListas';
import type { ClienteResumoDto } from '../../gen/types/ClienteResumoDto';
import { invalidarAvisos, useSelosDeAviso } from '../../lib/avisos';
import { invalidarCatalogo, ordenarContratados } from '../../lib/catalogo';
import { formatarCnpj } from '../../lib/documentos';
import { numero } from '../../lib/formato';
import { type PodeNaTela, pode, podeNaTela } from '../../lib/permissoes';

const POR_PAGINA = 25;

const buscaSchema = z.object({
  busca: z.string().trim().min(1).optional().catch(undefined),
  contratadoId: z.uuid().optional().catch(undefined),
  situacao: z.enum(['ativos', 'inativos']).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
  novo: z.literal(1).optional().catch(undefined),
  /** Aba do painel que abre primeiro (o atalho do aviso de preço repetido abre em Preços). */
  aba: z.enum(['precos']).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const consulta = (b: Busca) => ({
  query: {
    busca: b.busca,
    contratadoId: b.contratadoId,
    ativo: b.situacao === undefined ? undefined : b.situacao === 'ativos',
    pagina: b.pagina ?? 1,
    porPagina: POR_PAGINA,
  },
});

export const Route = createFileRoute('/_app/clientes')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    if (!pode(context.sessao, 'clientes.ver')) return;
    // O item vem depois: o painel abre na hora, com o skeleton, enquanto ele carrega.
    if (deps.id)
      void context.queryClient.prefetchQuery(
        clientesControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    // Na própria tela (filtro, página, painel), a lista busca sozinha e deixa a de antes à vista,
    // esmaecida, enquanto isso.
    await Promise.all([
      cause !== 'stay' &&
        context.queryClient.ensureQueryData(clientesControllerListarQueryOptions(consulta(deps))),
      context.queryClient.ensureQueryData(opcoesControllerListasQueryOptions()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Clientes · One' }] }),
  component: PaginaClientes,
});

function PaginaClientes() {
  const { sessao } = Route.useRouteContext();
  return pode(sessao, 'clientes.ver') ? (
    <Clientes permissoes={podeNaTela(sessao, 'clientes')} />
  ) : (
    <SemPermissao tela="Clientes" />
  );
}

const coluna = createDataTableColumnHelper<ClienteResumoDto>();
function Clientes({ permissoes }: { permissoes: PodeNaTela }) {
  const { sessao } = Route.useRouteContext();
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const lista = useQuery({
    ...clientesControllerListarQueryOptions(consulta(busca)),
    placeholderData: keepPreviousData,
  });
  const pagina = lista.data ?? { itens: [], pagina: 1, porPagina: POR_PAGINA, total: 0 };
  const { data: opcoes } = useSuspenseQuery(opcoesControllerListasQueryOptions());
  const selos = useSelosDeAviso(
    'cliente',
    pagina.itens.map((c) => c.id),
    pode(sessao, 'avisos.ver'),
  );

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
      coluna.accessor('nome', {
        header: 'Cliente',
        cell: (info) => (
          <span className="flex items-start gap-2">
            <LinkDaLinha
              from={Route.fullPath}
              to="."
              search={(a: Busca) => ({
                ...a,
                id: info.row.original.id,
                novo: undefined,
                aba: undefined,
              })}
            >
              <span className="flex flex-col leading-snug">
                <span>{info.getValue()}</span>
                {info.row.original.unificadoEm ? (
                  <span className="text-muted-foreground text-[13px] font-normal">
                    Unidade de {info.row.original.unificadoEm.nome}
                  </span>
                ) : (
                  info.row.original.nomeFantasia && (
                    <span className="text-muted-foreground text-[13px] font-normal">
                      {info.row.original.nomeFantasia}
                    </span>
                  )
                )}
              </span>
            </LinkDaLinha>
            <SeloAviso avisos={selos.get(info.row.original.id)} entidade="cliente" />
          </span>
        ),
      }),
      coluna.accessor('cnpj', {
        header: 'CNPJ',
        cell: (info) => <span className="whitespace-nowrap">{formatarCnpj(info.getValue())}</span>,
      }),
      coluna.accessor((c) => c.contratado?.razaoSocial ?? '—', {
        id: 'contratado',
        header: 'Empresa que fatura',
      }),
      coluna.accessor('totalAliases', {
        header: () => <span className="block text-right">Apelidos</span>,
        cell: (info) => <span className="block text-right">{numero(info.getValue())}</span>,
      }),
      coluna.accessor('ativo', {
        header: 'Situação',
        cell: (info) => (
          <span className="flex flex-wrap gap-1">
            {info.getValue() ? (
              <Etiqueta tom="sucesso">Ativo</Etiqueta>
            ) : (
              <Etiqueta tom="inativo">Inativo</Etiqueta>
            )}
            {info.row.original.ocultoDashboards && (
              <Etiqueta tom="info">Oculto nos painéis</Etiqueta>
            )}
          </span>
        ),
      }),
    ],
    [selos],
  );

  return (
    <ListaCadastro
      titulo="Clientes"
      novo={
        permissoes.criar
          ? { rotulo: 'Novo cliente', onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })) }
          : undefined
      }
      busca={{
        valor: busca.busca,
        rotulo: 'Buscar clientes',
        placeholder: 'Nome, razão social ou CNPJ',
      }}
      temFiltro={busca.situacao !== undefined || busca.contratadoId !== undefined}
      filtros={
        <>
          <Select
            aria-label="Filtrar por empresa que fatura"
            value={busca.contratadoId ?? ''}
            onValueChange={(v) => filtrar({ contratadoId: v || undefined })}
            opcoes={[
              { valor: '', rotulo: 'Todas as empresas' },
              ...ordenarContratados(opcoes.contratados).map((c) => ({
                valor: c.id,
                rotulo: c.nome,
              })),
            ]}
            className="flex-[1_1_180px] md:flex-[0_1_220px]"
          />
          <Select
            aria-label="Filtrar por situação"
            value={busca.situacao ?? ''}
            onValueChange={(v) => filtrar({ situacao: (v || undefined) as Busca['situacao'] })}
            opcoes={[
              { valor: '', rotulo: 'Todas as situações' },
              { valor: 'ativos', rotulo: 'Ativos' },
              { valor: 'inativos', rotulo: 'Inativos' },
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
          ? { erro: lista.error, oQue: 'os clientes', onTentarDeNovo: () => void lista.refetch() }
          : undefined
      }
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhum cliente cadastrado.',
        texto: permissoes.criar
          ? 'Cadastre o cliente com o nome igual ao da MobileMed para os laudos dele serem reconhecidos.'
          : 'Quem cuida do cadastro de clientes os inclui aqui.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() =>
        filtrar({ busca: undefined, situacao: undefined, contratadoId: undefined })
      }
      onIrPara={(n) => ir((a) => ({ ...a, pagina: n }))}
      painel={
        busca.id || (busca.novo && permissoes.criar) ? (
          <Painel
            key={busca.id ?? 'novo'}
            id={busca.id}
            abaInicial={busca.aba}
            veAvisos={pode(sessao, 'avisos.ver')}
            contratados={opcoes.contratados}
            permissoes={permissoes}
          />
        ) : undefined
      }
    />
  );
}

function Painel({
  id,
  contratados,
  permissoes,
  abaInicial,
  veAvisos,
}: {
  abaInicial?: 'precos';
  veAvisos: boolean;
  id?: string;
  contratados: { id: string; nome: string; padrao: boolean }[];
  permissoes: PodeNaTela;
}) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { sessao } = Route.useRouteContext();
  const consulta = useQuery({
    ...clientesControllerObterQueryOptions({ path: { id: id ?? '' } }),
    enabled: Boolean(id),
  });
  const cliente = consulta.data;
  const avisos = useAvisos();
  const veCorte = pode(sessao, 'faturamento.ver');
  const veDados = pode(sessao, 'clientes.faturamento.ver');
  const fase = useFaseDoCarregamento(Boolean(id) && !cliente);
  const fechar = () =>
    void navigate({ search: (a) => ({ ...a, id: undefined, novo: undefined, aba: undefined }) });
  const selos = useSelosDeAviso('cliente', id ? [id] : [], veAvisos);
  if (id && (!cliente || fase !== 'conteudo'))
    return (
      <PainelCarregando
        onFechar={fechar}
        erro={consulta.error ?? undefined}
        oQue="o cliente"
        voltar={{ to: '/clientes', rotulo: 'Voltar para Clientes' }}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );

  return (
    <PainelCliente
      cliente={cliente}
      abaInicial={abaInicial}
      selo={id ? <SeloAviso avisos={selos.get(id)} entidade="cliente" /> : undefined}
      contratados={contratados}
      podeEditar={id ? permissoes.editar : permissoes.criar}
      podeCriar={permissoes.criar}
      podeExcluir={permissoes.excluir}
      onFechar={fechar}
      historico={id ? <HistoricoCadastro key={id} cadastro="cliente" id={id} /> : undefined}
      distribuicao={
        id && pode(sessao, 'clientes.distribuicao.ver') ? (
          <AbaDistribuicaoCliente
            key={id}
            clienteId={id}
            podeEditar={pode(sessao, 'clientes.distribuicao.editar')}
          />
        ) : undefined
      }
      faturamento={
        id && (veCorte || veDados) ? (
          <div className="flex flex-col gap-6 p-4">
            {veCorte && (
              <section className="flex flex-col gap-4">
                <h3 className="text-base font-semibold">Corte da competência</h3>
                <EditorCorte
                  key={id}
                  clienteId={id}
                  podeEditar={pode(sessao, 'faturamento.corte.editar')}
                  porPagina={5}
                  unidadeDe={cliente?.unificadoEm?.nome}
                  nivelTitulos={4}
                />
              </section>
            )}
            {veCorte && (
              <section className="flex flex-col gap-4 border-t pt-6">
                <h3 className="text-base font-semibold">Tipificação</h3>
                <EditorTipificacao
                  key={id}
                  clienteId={id}
                  podeEditar={pode(sessao, 'faturamento.tipificacao.editar')}
                />
              </section>
            )}
            {veDados && (
              <section className={veCorte ? 'border-t pt-6' : undefined}>
                <DadosFaturamentoCliente
                  key={id}
                  clienteId={id}
                  podeEditar={pode(sessao, 'clientes.faturamento.editar')}
                  unidadeDe={cliente?.unificadoEm?.nome}
                />
              </section>
            )}
          </div>
        ) : undefined
      }
      precos={
        id && veCorte ? (
          <div className="p-4">
            <TabelaPrecos
              key={id}
              veAvisos={veAvisos}
              tipo="cliente"
              donoId={id}
              podeEditar={pode(sessao, 'faturamento.precos.editar')}
            />
          </div>
        ) : undefined
      }
      onSalvar={async (body) => {
        let alvo = id;
        if (id) await clientesControllerAtualizar({ path: { id }, body }).unwrap();
        else alvo = (await clientesControllerCriar({ body }).unwrap()).id;
        // Reativar o cliente resolve na hora o aviso de cliente inativo dele (selo, faixa, menu).
        await Promise.all([invalidarCatalogo(queryClient), invalidarAvisos(queryClient)]);
        avisos.sucesso(id ? 'Cliente salvo.' : 'Cliente criado.');
        void navigate({ search: (a) => ({ ...a, novo: undefined, id: alvo }), replace: true });
      }}
      onExcluir={
        id && permissoes.excluir
          ? async () => {
              await clientesControllerExcluir({ path: { id } }).unwrap();
              fechar();
              avisos.sucesso('Cliente excluído.');
              await invalidarCatalogo(queryClient);
            }
          : undefined
      }
      onCriarApelido={async (body) => {
        if (!id) return;
        await clientesControllerCriarAlias({ path: { id }, body }).unwrap();
        await invalidarCatalogo(queryClient);
        avisos.sucesso('Apelido adicionado.');
      }}
      onExcluirApelido={async (aliasId) => {
        if (!id) return;
        const apelido = cliente?.aliases.find((a) => a.id === aliasId);
        await clientesControllerExcluirAlias({ path: { id, aliasId } }).unwrap();
        await invalidarCatalogo(queryClient);
        avisos.sucesso('Apelido removido.', {
          acao: apelido && {
            rotulo: 'Desfazer',
            onClick: async () => {
              await clientesControllerCriarAlias({
                path: { id },
                body: {
                  tipo: apelido.tipo,
                  padrao: apelido.padrao,
                  observacoes: apelido.observacoes,
                },
              }).unwrap();
              await invalidarCatalogo(queryClient);
            },
          },
        });
      }}
      unificacao={
        id && cliente
          ? {
              buscarClientes: async (termo, sinal) => {
                const { itens } = await clientesControllerListar({
                  query: { busca: termo, porPagina: 10 },
                  signal: sinal,
                }).unwrap();
                return itens
                  .filter((c) => c.id !== id)
                  .map((c) => ({
                    valor: c.id,
                    rotulo: c.nome,
                    detalhe: c.unificadoEm ? `Unidade de ${c.unificadoEm.nome}` : undefined,
                  }));
              },
              onAdicionar: async (clienteId) => {
                await clientesControllerAdicionarUnidade({
                  path: { id },
                  body: { clienteId },
                }).unwrap();
                await invalidarCatalogo(queryClient);
              },
              onRemover: async (unidadeId) => {
                await clientesControllerRemoverUnidade({ path: { id, unidadeId } }).unwrap();
                await invalidarCatalogo(queryClient);
              },
              onDesfazer: async () => {
                if (!cliente.unificadoEm) return;
                await clientesControllerRemoverUnidade({
                  path: { id: cliente.unificadoEm.id, unidadeId: id },
                }).unwrap();
                await invalidarCatalogo(queryClient);
              },
              onAbrir: (outro) => void navigate({ search: (a) => ({ ...a, id: outro }) }),
            }
          : undefined
      }
    />
  );
}
