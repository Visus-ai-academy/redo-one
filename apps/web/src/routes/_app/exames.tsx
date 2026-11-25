import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { Abas } from '../../components/abas/Abas';
import { SeloAviso } from '../../components/avisos/SeloAviso';
import { ListaCadastro } from '../../components/cadastro/ListaCadastro';
import { PainelExame } from '../../components/catalogo/PainelExame';
import { PainelExameForaPadrao } from '../../components/catalogo/PainelExameForaPadrao';
import { PainelQuebra } from '../../components/catalogo/PainelQuebra';
import { createDataTableColumnHelper } from '../../components/data-table/columns';
import { LinkDaLinha } from '../../components/data-table/link-da-linha';
import { SemPermissao } from '../../components/estado/estados';
import { Etiqueta } from '../../components/etiqueta/Etiqueta';
import { HistoricoCadastro } from '../../components/historico-cadastro/HistoricoCadastro';
import { PainelCarregando } from '../../components/painel/PainelCarregando';
import { Select } from '../../components/select/Select';
import { useFaseDoCarregamento } from '../../components/skeleton/use-fase-do-carregamento';
import { useAvisos } from '../../components/toast/use-avisos';
import { deParaValoresExameControllerAtualizar } from '../../gen/clients/deParaValoresExameControllerAtualizar';
import { deParaValoresExameControllerCriar } from '../../gen/clients/deParaValoresExameControllerCriar';
import { deParaValoresExameControllerExcluir } from '../../gen/clients/deParaValoresExameControllerExcluir';
import { examesControllerAtualizar } from '../../gen/clients/examesControllerAtualizar';
import { examesControllerCriar } from '../../gen/clients/examesControllerCriar';
import { examesControllerDefinirSubespecialidade } from '../../gen/clients/examesControllerDefinirSubespecialidade';
import { examesControllerExcluir } from '../../gen/clients/examesControllerExcluir';
import { opcoesControllerExames } from '../../gen/clients/opcoesControllerExames';
import { quebrasControllerAdicionarPeca } from '../../gen/clients/quebrasControllerAdicionarPeca';
import { quebrasControllerAtualizar } from '../../gen/clients/quebrasControllerAtualizar';
import { quebrasControllerAtualizarPeca } from '../../gen/clients/quebrasControllerAtualizarPeca';
import { quebrasControllerCriar } from '../../gen/clients/quebrasControllerCriar';
import { quebrasControllerExcluir } from '../../gen/clients/quebrasControllerExcluir';
import { quebrasControllerRemoverPeca } from '../../gen/clients/quebrasControllerRemoverPeca';
import { deParaValoresExameControllerListarQueryOptions } from '../../gen/hooks/useDeParaValoresExameControllerListar';
import { deParaValoresExameControllerObterQueryOptions } from '../../gen/hooks/useDeParaValoresExameControllerObter';
import { examesControllerListarQueryOptions } from '../../gen/hooks/useExamesControllerListar';
import { examesControllerObterQueryOptions } from '../../gen/hooks/useExamesControllerObter';
import { opcoesControllerListasQueryOptions } from '../../gen/hooks/useOpcoesControllerListas';
import { quebrasControllerListarQueryOptions } from '../../gen/hooks/useQuebrasControllerListar';
import { quebrasControllerObterQueryOptions } from '../../gen/hooks/useQuebrasControllerObter';
import type { DeParaValorItemDto } from '../../gen/types/DeParaValorItemDto';
import type { ExameResumoDto } from '../../gen/types/ExameResumoDto';
import type { QuebraResumoDto } from '../../gen/types/QuebraResumoDto';
import { useSelosDeAviso } from '../../lib/avisos';
import {
  invalidarCatalogo,
  subespecialidadeQueFica,
  subespecialidadesDaEspecialidade,
} from '../../lib/catalogo';
import { numero } from '../../lib/formato';
import { type PodeNaTela, pode, podeNaTela } from '../../lib/permissoes';

const POR_PAGINA = 25;

/**
 * Padronizados (o cadastro), fora do padrão (grafias da MobileMed) e quebras (estudo que vira vários
 * exames): listas separadas, nunca juntas.
 */
const ABAS = [
  { valor: 'padronizados', rotulo: 'Padronizados' },
  { valor: 'fora-do-padrao', rotulo: 'Fora do padrão' },
  { valor: 'quebras', rotulo: 'Quebras' },
] as const;
type Aba = (typeof ABAS)[number]['valor'];

const buscaSchema = z.object({
  aba: z.enum(['padronizados', 'fora-do-padrao', 'quebras']).optional().catch(undefined),
  busca: z.string().trim().min(1).optional().catch(undefined),
  modalidadeId: z.uuid().optional().catch(undefined),
  especialidadeId: z.uuid().optional().catch(undefined),
  subespecialidadeId: z.uuid().optional().catch(undefined),
  situacao: z.enum(['ativos', 'inativos']).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
  novo: z.literal(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const consulta = (b: Busca) => ({
  query: {
    busca: b.busca,
    modalidadeId: b.modalidadeId,
    especialidadeId: b.especialidadeId,
    subespecialidadeId: b.subespecialidadeId,
    ativo: b.situacao === undefined ? undefined : b.situacao === 'ativos',
    pagina: b.pagina ?? 1,
    porPagina: POR_PAGINA,
  },
});

const consultaForaPadrao = (b: Busca) =>
  deParaValoresExameControllerListarQueryOptions({
    query: {
      busca: b.busca,
      ativo: b.situacao === undefined ? undefined : b.situacao === 'ativos',
      pagina: b.pagina ?? 1,
      porPagina: POR_PAGINA,
    },
  });

const consultaQuebras = (b: Busca) =>
  quebrasControllerListarQueryOptions({
    query: { busca: b.busca, pagina: b.pagina ?? 1, porPagina: POR_PAGINA },
  });

export const Route = createFileRoute('/_app/exames')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, cause }) => {
    if (!pode(context.sessao, 'exames.ver')) return;
    // Na própria tela (filtro, página, painel), a lista busca sozinha e deixa a de antes à vista,
    // esmaecida, enquanto isso.
    const esperar = cause !== 'stay';
    if (deps.aba === 'fora-do-padrao') {
      if (esperar) await context.queryClient.ensureQueryData(consultaForaPadrao(deps));
      return;
    }
    if (deps.aba === 'quebras') {
      if (deps.id)
        void context.queryClient.prefetchQuery(
          quebrasControllerObterQueryOptions({ path: { id: deps.id } }),
        );
      await Promise.all([
        esperar && context.queryClient.ensureQueryData(consultaQuebras(deps)),
        context.queryClient.ensureQueryData(opcoesControllerListasQueryOptions()),
      ]);
      return;
    }
    // O item vem depois: o painel abre na hora, com o skeleton, enquanto ele carrega.
    if (deps.id)
      void context.queryClient.prefetchQuery(
        examesControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    await Promise.all([
      esperar &&
        context.queryClient.ensureQueryData(examesControllerListarQueryOptions(consulta(deps))),
      context.queryClient.ensureQueryData(opcoesControllerListasQueryOptions()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Exames · One' }] }),
  component: PaginaExames,
});

function PaginaExames() {
  const { sessao } = Route.useRouteContext();
  const { aba } = Route.useSearch();
  if (!pode(sessao, 'exames.ver')) return <SemPermissao tela="Exames" />;
  const permissoes = podeNaTela(sessao, 'exames');
  if (aba === 'fora-do-padrao') return <ForaDoPadrao permissoes={permissoes} />;
  if (aba === 'quebras') return <Quebras permissoes={permissoes} />;
  return <Exames permissoes={permissoes} />;
}

/** Abas da tela; trocar de aba recomeça busca, filtros e página. */
function AbasExames({ aba }: { aba: Aba }) {
  const navigate = Route.useNavigate();
  return (
    <Abas
      aria-label="Exames"
      valor={aba}
      onMudar={(v) =>
        void navigate({ search: { aba: v === 'padronizados' ? undefined : (v as Aba) } })
      }
      abas={[...ABAS]}
    />
  );
}

const coluna = createDataTableColumnHelper<ExameResumoDto>();
const nome = (ref: { nome: string } | null) => ref?.nome ?? '—';

function Exames({ permissoes }: { permissoes: PodeNaTela }) {
  const { sessao } = Route.useRouteContext();
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const lista = useQuery({
    ...examesControllerListarQueryOptions(consulta(busca)),
    placeholderData: keepPreviousData,
  });
  const pagina = lista.data ?? { itens: [], pagina: 1, porPagina: POR_PAGINA, total: 0 };
  const selos = useSelosDeAviso(
    'exame',
    pagina.itens.map((x) => x.id),
    pode(sessao, 'avisos.ver'),
  );
  const { data: opcoes } = useSuspenseQuery(opcoesControllerListasQueryOptions());

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
        header: 'Exame',
        cell: (info) => (
          <span className="flex items-start gap-2">
            <LinkDaLinha
              from={Route.fullPath}
              to="."
              search={(a: Busca) => ({ ...a, id: info.row.original.id, novo: undefined })}
            >
              <span className="flex flex-col leading-snug">
                <span>{info.getValue()}</span>
                {info.row.original.codigo && (
                  <span className="text-muted-foreground text-[13px] font-normal">
                    {info.row.original.codigo}
                  </span>
                )}
              </span>
            </LinkDaLinha>
            <SeloAviso avisos={selos.get(info.row.original.id)} entidade="exame" />
          </span>
        ),
      }),
      coluna.accessor((e) => nome(e.modalidade), { id: 'modalidade', header: 'Modalidade' }),
      coluna.accessor((e) => nome(e.especialidade), {
        id: 'especialidade',
        header: 'Especialidade',
      }),
      coluna.accessor((e) => nome(e.subespecialidade), {
        id: 'subespecialidade',
        header: 'Subespecialidade',
      }),
      coluna.accessor((e) => nome(e.categoria), { id: 'categoria', header: 'Categoria' }),
      coluna.accessor('ativo', {
        header: 'Situação',
        cell: (info) => (
          <span className="flex flex-wrap gap-1">
            {info.getValue() ? (
              <Etiqueta tom="sucesso">Ativo</Etiqueta>
            ) : (
              <Etiqueta tom="inativo">Inativo</Etiqueta>
            )}
            {info.row.original.exigeRevisaoManual && (
              <Etiqueta tom="atencao">Revisão manual</Etiqueta>
            )}
          </span>
        ),
      }),
    ],
    [selos],
  );

  const temFiltro = Boolean(
    busca.situacao || busca.modalidadeId || busca.especialidadeId || busca.subespecialidadeId,
  );
  return (
    <ListaCadastro
      titulo="Exames"
      totalNoTitulo={false}
      abas={<AbasExames aba="padronizados" />}
      novo={
        permissoes.criar
          ? { rotulo: 'Novo exame', onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })) }
          : undefined
      }
      busca={{ valor: busca.busca, rotulo: 'Buscar exames', placeholder: 'Nome ou código' }}
      temFiltro={temFiltro}
      filtros={
        <>
          <Select
            aria-label="Filtrar por modalidade"
            value={busca.modalidadeId ?? ''}
            onValueChange={(v) => filtrar({ modalidadeId: v || undefined })}
            opcoes={[
              { valor: '', rotulo: 'Todas as modalidades' },
              ...opcoes.modalidades.map((m) => ({ valor: m.id, rotulo: m.nome, cor: m.cor })),
            ]}
            className="flex-[1_1_160px] md:flex-[0_1_200px]"
          />
          <Select
            aria-label="Filtrar por especialidade"
            value={busca.especialidadeId ?? ''}
            onValueChange={(v) =>
              filtrar({
                especialidadeId: v || undefined,
                subespecialidadeId: subespecialidadeQueFica(
                  opcoes.subespecialidades,
                  busca.subespecialidadeId,
                  v || undefined,
                ),
              })
            }
            opcoes={[
              { valor: '', rotulo: 'Todas as especialidades' },
              ...opcoes.especialidades.map((e) => ({ valor: e.id, rotulo: e.nome, cor: e.cor })),
            ]}
            className="flex-[1_1_160px] md:flex-[0_1_220px]"
          />
          <Select
            aria-label="Filtrar por subespecialidade"
            value={busca.subespecialidadeId ?? ''}
            onValueChange={(v) => filtrar({ subespecialidadeId: v || undefined })}
            opcoes={[
              { valor: '', rotulo: 'Todas as subespecialidades' },
              ...subespecialidadesDaEspecialidade(
                opcoes.subespecialidades,
                busca.especialidadeId,
              ).map((s) => ({ valor: s.id, rotulo: s.nome })),
            ]}
            className="flex-[1_1_160px] md:flex-[0_1_230px]"
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
            className="flex-[1_1_160px] md:flex-[0_1_180px]"
          />
        </>
      }
      colunas={colunas}
      itens={pagina.itens}
      getRowId={(e) => e.id}
      selecionadoId={busca.id}
      recarregando={lista.isPlaceholderData}
      erro={
        lista.isError && !lista.data
          ? { erro: lista.error, oQue: 'os exames', onTentarDeNovo: () => void lista.refetch() }
          : undefined
      }
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhum exame cadastrado.',
        texto: permissoes.criar
          ? 'Cadastre o exame com o nome igual ao estudo da MobileMed e a classificação dele.'
          : 'Quem cuida do catálogo de exames os inclui aqui.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() =>
        filtrar({
          busca: undefined,
          situacao: undefined,
          modalidadeId: undefined,
          especialidadeId: undefined,
          subespecialidadeId: undefined,
        })
      }
      onIrPara={(n) => ir((a) => ({ ...a, pagina: n }))}
      painel={
        busca.id || (busca.novo && permissoes.criar) ? (
          <Painel key={busca.id ?? 'novo'} id={busca.id} permissoes={permissoes} />
        ) : undefined
      }
    />
  );
}

const buscarExames = async (termo: string, sinal?: AbortSignal) => {
  const exames = await opcoesControllerExames({ query: { busca: termo }, signal: sinal }).unwrap();
  return exames.map((e) => ({ valor: e.id, rotulo: e.nome, detalhe: e.modalidade }));
};

function Painel({ id, permissoes }: { id?: string; permissoes: PodeNaTela }) {
  const navigate = Route.useNavigate();
  const { sessao } = Route.useRouteContext();
  const { sucesso } = useAvisos();
  // Quem não edita o exame inteiro pode ter a permissão de mudar só a subespecialidade.
  const soSubespecialidade = !permissoes.editar && pode(sessao, 'exames.subespecialidade.editar');
  const queryClient = useQueryClient();
  const { data: opcoes } = useSuspenseQuery(opcoesControllerListasQueryOptions());
  const consulta = useQuery({
    ...examesControllerObterQueryOptions({ path: { id: id ?? '' } }),
    enabled: Boolean(id),
  });
  const exame = consulta.data;
  const fase = useFaseDoCarregamento(Boolean(id) && !exame);
  const fechar = () => void navigate({ search: (a) => ({ ...a, id: undefined, novo: undefined }) });
  if (id && (!exame || fase !== 'conteudo'))
    return (
      <PainelCarregando
        onFechar={fechar}
        erro={consulta.error ?? undefined}
        oQue="o exame"
        voltar={{ to: '/exames', rotulo: 'Voltar para Exames' }}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );

  return (
    <PainelExame
      exame={exame}
      opcoes={opcoes}
      podeEditar={id ? permissoes.editar : permissoes.criar}
      podeCriar={permissoes.criar}
      onFechar={fechar}
      historico={id ? <HistoricoCadastro key={id} cadastro="exame" id={id} /> : undefined}
      onSalvar={async (body) => {
        let alvo = id;
        if (id) await examesControllerAtualizar({ path: { id }, body }).unwrap();
        else alvo = (await examesControllerCriar({ body }).unwrap()).id;
        await invalidarCatalogo(queryClient);
        sucesso(id ? 'Exame salvo.' : 'Exame criado.');
        void navigate({ search: (a) => ({ ...a, novo: undefined, id: alvo }), replace: true });
      }}
      onSalvarSubespecialidade={
        id && soSubespecialidade
          ? async (subespecialidadeId) => {
              await examesControllerDefinirSubespecialidade({
                path: { id },
                body: { subespecialidadeId },
              }).unwrap();
              await invalidarCatalogo(queryClient);
              sucesso('Subespecialidade salva.');
            }
          : undefined
      }
      onExcluir={
        id && permissoes.excluir
          ? async () => {
              await examesControllerExcluir({ path: { id } }).unwrap();
              fechar();
              sucesso('Exame excluído.');
              await invalidarCatalogo(queryClient);
            }
          : undefined
      }
      onAbrirQuebra={(quebraId) => void navigate({ search: { aba: 'quebras', id: quebraId } })}
      onCriarQuebra={async () => {
        if (!exame) return;
        const { id: quebraId } = await quebrasControllerCriar({
          body: { estudoOrigem: exame.nome },
        }).unwrap();
        await invalidarCatalogo(queryClient);
        void navigate({ search: { aba: 'quebras', id: quebraId } });
      }}
    />
  );
}

const cFora = createDataTableColumnHelper<DeParaValorItemDto>();

/** Estudos que chegam fora do padrão do cadastro, com quanto valem e o exame padronizado ligado. */
function ForaDoPadrao({ permissoes }: { permissoes: PodeNaTela }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const lista = useQuery({ ...consultaForaPadrao(busca), placeholderData: keepPreviousData });
  const pagina = lista.data ?? { itens: [], pagina: 1, porPagina: POR_PAGINA, total: 0 };

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const filtrar = useCallback(
    (novos: Partial<Busca>) => ir((a) => ({ ...a, ...novos, pagina: undefined }), true),
    [ir],
  );

  // A coluna inteira com a mesma quantidade de casas: 2 se algum vale fração, senão nenhuma.
  const casasVale = pagina.itens.some((i) => !Number.isInteger(i.valores)) ? 2 : 0;
  const colunas = useMemo(
    () => [
      cFora.accessor('estudoDescricao', {
        header: 'Descrição do estudo',
        cell: (i) => (
          <LinkDaLinha
            from={Route.fullPath}
            to="."
            search={(a: Busca) => ({ ...a, id: i.row.original.id, novo: undefined })}
          >
            {i.getValue()}
          </LinkDaLinha>
        ),
      }),
      cFora.accessor('valores', {
        header: () => <span className="block text-right">Vale</span>,
        cell: (i) => (
          <span className="block text-right tabular-nums">{numero(i.getValue(), casasVale)}</span>
        ),
      }),
      cFora.accessor('destinoNome', {
        header: 'Exame padronizado',
        cell: (i) => (
          <span className={i.getValue() ? undefined : 'text-muted-foreground'}>
            {i.getValue() ?? '—'}
          </span>
        ),
      }),
      cFora.accessor('ativo', {
        header: 'Situação',
        cell: (i) =>
          i.getValue() ? (
            <Etiqueta tom="sucesso">Ativo</Etiqueta>
          ) : (
            <Etiqueta tom="inativo">Inativo</Etiqueta>
          ),
      }),
    ],
    [casasVale],
  );

  return (
    <ListaCadastro
      titulo="Exames"
      totalNoTitulo={false}
      abas={<AbasExames aba="fora-do-padrao" />}
      novo={
        permissoes.criar
          ? {
              rotulo: 'Novo exame fora do padrão',
              onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })),
            }
          : undefined
      }
      busca={{
        valor: busca.busca,
        rotulo: 'Buscar exames fora do padrão',
        placeholder: 'Descrição do estudo',
      }}
      temFiltro={busca.situacao !== undefined}
      filtros={
        <Select
          aria-label="Filtrar por situação"
          value={busca.situacao ?? ''}
          onValueChange={(v) => filtrar({ situacao: (v || undefined) as Busca['situacao'] })}
          opcoes={[
            { valor: '', rotulo: 'Todas as situações' },
            { valor: 'ativos', rotulo: 'Ativos' },
            { valor: 'inativos', rotulo: 'Inativos' },
          ]}
          className="flex-[1_1_160px] md:flex-[0_1_180px]"
        />
      }
      colunas={colunas}
      itens={pagina.itens}
      getRowId={(i) => i.id}
      selecionadoId={busca.id}
      recarregando={lista.isPlaceholderData}
      erro={
        lista.isError && !lista.data
          ? {
              erro: lista.error,
              oQue: 'os exames fora do padrão',
              onTentarDeNovo: () => void lista.refetch(),
            }
          : undefined
      }
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhum exame fora do padrão.',
        texto:
          'Estudos que chegam da MobileMed com outra grafia ou fora do cadastro aparecem aqui.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() => filtrar({ busca: undefined, situacao: undefined })}
      onIrPara={(n) => ir((a) => ({ ...a, pagina: n }))}
      painel={
        busca.id || (busca.novo && permissoes.criar) ? (
          <PainelForaPadrao
            key={busca.id ?? 'novo'}
            id={busca.id}
            itens={pagina.itens}
            permissoes={permissoes}
          />
        ) : undefined
      }
    />
  );
}

/** O item aberto vem da página atual (o `?id=` aponta para uma linha visível). */
function PainelForaPadrao({
  id,
  itens,
  permissoes,
}: {
  id?: string;
  itens: DeParaValorItemDto[];
  permissoes: PodeNaTela;
}) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const daPagina = id ? itens.find((i) => i.id === id) : undefined;
  // Fora da página aberta (recém-criado, link direto): busca pelo id.
  const consulta = useQuery({
    ...deParaValoresExameControllerObterQueryOptions({ path: { id: id ?? '' } }),
    enabled: Boolean(id) && !daPagina,
  });
  const item = daPagina ?? consulta.data;
  const fase = useFaseDoCarregamento(Boolean(id) && !item);
  const { sucesso } = useAvisos();
  const fechar = () => void navigate({ search: (a) => ({ ...a, id: undefined, novo: undefined }) });
  if (id && (!item || fase !== 'conteudo'))
    return (
      <PainelCarregando
        onFechar={fechar}
        erro={consulta.error ?? undefined}
        oQue="o exame fora do padrão"
        voltar={{ to: '/exames', rotulo: 'Voltar para Exames' }}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );

  return (
    <PainelExameForaPadrao
      item={item}
      buscarExames={buscarExames}
      podeEditar={id ? permissoes.editar : permissoes.criar}
      onFechar={fechar}
      onSalvar={async (body) => {
        let alvo = id;
        if (id) await deParaValoresExameControllerAtualizar({ path: { id }, body }).unwrap();
        else alvo = (await deParaValoresExameControllerCriar({ body }).unwrap()).id;
        await invalidarCatalogo(queryClient);
        sucesso(id ? 'Exame fora do padrão salvo.' : 'Exame fora do padrão criado.');
        void navigate({ search: (a) => ({ ...a, novo: undefined, id: alvo }), replace: true });
      }}
      onExcluir={
        id && permissoes.excluir
          ? async () => {
              await deParaValoresExameControllerExcluir({ path: { id } }).unwrap();
              fechar();
              sucesso('Exame fora do padrão excluído.');
              await invalidarCatalogo(queryClient);
            }
          : undefined
      }
    />
  );
}

const cQuebra = createDataTableColumnHelper<QuebraResumoDto>();

/** Estudos que, laudados, viram vários exames na cobrança (cada exame vale 1). */
function Quebras({ permissoes }: { permissoes: PodeNaTela }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const lista = useQuery({ ...consultaQuebras(busca), placeholderData: keepPreviousData });
  const pagina = lista.data ?? { itens: [], pagina: 1, porPagina: POR_PAGINA, total: 0 };

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
      cQuebra.accessor('estudoOrigem', {
        header: 'Estudo que chega',
        cell: (i) => (
          <LinkDaLinha
            from={Route.fullPath}
            to="."
            search={(a: Busca) => ({ ...a, id: i.row.original.id, novo: undefined })}
          >
            <span className="flex flex-col leading-snug">
              <span>{i.getValue()}</span>
              {i.row.original.exame && (
                <span className="text-muted-foreground text-[13px] font-normal">
                  Também é exame do cadastro
                </span>
              )}
            </span>
          </LinkDaLinha>
        ),
      }),
      cQuebra.accessor((q) => q.pecas.filter((p) => p.ativo).map((p) => p.nome), {
        id: 'pecas',
        header: 'Vira na cobrança',
        cell: (i) =>
          i.getValue().length === 0 ? (
            <span className="text-muted-foreground">Nenhum exame</span>
          ) : (
            <span className="flex flex-col leading-snug">
              {i.getValue().map((nomePeca) => (
                <span key={nomePeca}>{nomePeca}</span>
              ))}
            </span>
          ),
      }),
      cQuebra.accessor((q) => q.pecas.filter((p) => p.ativo).length, {
        id: 'total',
        header: () => <span className="block text-right">Exames</span>,
        cell: (i) => <span className="block text-right tabular-nums">{i.getValue()}</span>,
      }),
    ],
    [],
  );

  return (
    <ListaCadastro
      titulo="Exames"
      totalNoTitulo={false}
      abas={<AbasExames aba="quebras" />}
      novo={
        permissoes.criar
          ? { rotulo: 'Nova quebra', onClick: () => ir((a) => ({ ...a, id: undefined, novo: 1 })) }
          : undefined
      }
      busca={{
        valor: busca.busca,
        rotulo: 'Buscar quebras',
        placeholder: 'Estudo ou exame em que se quebra',
      }}
      temFiltro={false}
      colunas={colunas}
      itens={pagina.itens}
      getRowId={(q) => q.id}
      selecionadoId={busca.id}
      recarregando={lista.isPlaceholderData}
      erro={
        lista.isError && !lista.data
          ? { erro: lista.error, oQue: 'as quebras', onTentarDeNovo: () => void lista.refetch() }
          : undefined
      }
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhuma quebra.',
        texto: permissoes.criar
          ? 'Cadastre o estudo combinado como chega da MobileMed e os exames em que ele se quebra.'
          : 'Quem cuida do catálogo de exames as inclui aqui.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() => filtrar({ busca: undefined })}
      onIrPara={(n) => ir((a) => ({ ...a, pagina: n }))}
      painel={
        busca.id || (busca.novo && permissoes.criar) ? (
          <PainelDaQuebra key={busca.id ?? 'novo'} id={busca.id} permissoes={permissoes} />
        ) : undefined
      }
    />
  );
}

function PainelDaQuebra({ id, permissoes }: { id?: string; permissoes: PodeNaTela }) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { data: opcoes } = useSuspenseQuery(opcoesControllerListasQueryOptions());
  const consulta = useQuery({
    ...quebrasControllerObterQueryOptions({ path: { id: id ?? '' } }),
    enabled: Boolean(id),
  });
  const quebra = consulta.data;
  const fase = useFaseDoCarregamento(Boolean(id) && !quebra);
  const { sucesso } = useAvisos();
  const fechar = () => void navigate({ search: (a) => ({ ...a, id: undefined, novo: undefined }) });
  if (id && (!quebra || fase !== 'conteudo'))
    return (
      <PainelCarregando
        onFechar={fechar}
        erro={consulta.error ?? undefined}
        oQue="a quebra"
        voltar={{ to: '/exames', rotulo: 'Voltar para Exames' }}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );

  const depois = () => invalidarCatalogo(queryClient);
  return (
    <PainelQuebra
      quebra={quebra}
      categorias={opcoes.categoriasExame}
      buscarExames={buscarExames}
      podeEditar={id ? permissoes.editar : permissoes.criar}
      podeCriar={permissoes.criar}
      podeEditarPecas={permissoes.editar}
      podeExcluir={permissoes.excluir}
      onFechar={fechar}
      onSalvar={async (body) => {
        let alvo = id;
        if (id) await quebrasControllerAtualizar({ path: { id }, body }).unwrap();
        else alvo = (await quebrasControllerCriar({ body }).unwrap()).id;
        await depois();
        sucesso(id ? 'Quebra salva.' : 'Quebra criada.');
        void navigate({ search: (a) => ({ ...a, novo: undefined, id: alvo }), replace: true });
      }}
      onExcluir={
        id && permissoes.excluir
          ? async () => {
              await quebrasControllerExcluir({ path: { id } }).unwrap();
              fechar();
              sucesso('Quebra excluída.');
              await depois();
            }
          : undefined
      }
      onAdicionarPeca={async (body) => {
        if (!id) return;
        await quebrasControllerAdicionarPeca({ path: { id }, body }).unwrap();
        await depois();
      }}
      onAtualizarPeca={async (pecaId, body) => {
        if (!id) return;
        await quebrasControllerAtualizarPeca({ path: { id, pecaId }, body }).unwrap();
        await depois();
      }}
      onRemoverPeca={async (pecaId) => {
        if (!id) return;
        await quebrasControllerRemoverPeca({ path: { id, pecaId } }).unwrap();
        await depois();
      }}
    />
  );
}
