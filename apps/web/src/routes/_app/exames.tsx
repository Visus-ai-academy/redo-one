import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { Abas } from '../../components/abas/Abas';
import { BotaoAbrir, ListaCadastro } from '../../components/cadastro/ListaCadastro';
import { PainelExame } from '../../components/catalogo/PainelExame';
import { PainelExameForaPadrao } from '../../components/catalogo/PainelExameForaPadrao';
import { createDataTableColumnHelper } from '../../components/data-table/columns';
import { SemPermissao } from '../../components/estado/estados';
import { Etiqueta } from '../../components/etiqueta/Etiqueta';
import { PainelCarregando } from '../../components/painel/PainelCarregando';
import { Select } from '../../components/select/Select';
import { deParaValoresExameControllerAtualizar } from '../../gen/clients/deParaValoresExameControllerAtualizar';
import { deParaValoresExameControllerCriar } from '../../gen/clients/deParaValoresExameControllerCriar';
import { deParaValoresExameControllerExcluir } from '../../gen/clients/deParaValoresExameControllerExcluir';
import { examesControllerAtualizar } from '../../gen/clients/examesControllerAtualizar';
import { examesControllerAtualizarRegraQuebra } from '../../gen/clients/examesControllerAtualizarRegraQuebra';
import { examesControllerCriar } from '../../gen/clients/examesControllerCriar';
import { examesControllerCriarRegraQuebra } from '../../gen/clients/examesControllerCriarRegraQuebra';
import { examesControllerExcluir } from '../../gen/clients/examesControllerExcluir';
import { examesControllerExcluirRegraQuebra } from '../../gen/clients/examesControllerExcluirRegraQuebra';
import { opcoesControllerExames } from '../../gen/clients/opcoesControllerExames';
import { deParaValoresExameControllerListarQueryOptions } from '../../gen/hooks/useDeParaValoresExameControllerListar';
import { deParaValoresExameControllerObterQueryOptions } from '../../gen/hooks/useDeParaValoresExameControllerObter';
import { examesControllerListarQueryOptions } from '../../gen/hooks/useExamesControllerListar';
import { examesControllerObterQueryOptions } from '../../gen/hooks/useExamesControllerObter';
import { opcoesControllerListasQueryOptions } from '../../gen/hooks/useOpcoesControllerListas';
import type { DeParaValorItemDto } from '../../gen/types/DeParaValorItemDto';
import type { ExameResumoDto } from '../../gen/types/ExameResumoDto';
import { invalidarCatalogo } from '../../lib/catalogo';
import { pode } from '../../lib/permissoes';

const POR_PAGINA = 25;

/** Padronizados (o cadastro) e fora do padrão (grafias da MobileMed): listas separadas, nunca juntas. */
const ABAS = [
  { valor: 'padronizados', rotulo: 'Padronizados' },
  { valor: 'fora-do-padrao', rotulo: 'Fora do padrão' },
] as const;
type Aba = (typeof ABAS)[number]['valor'];

const buscaSchema = z.object({
  aba: z.enum(['padronizados', 'fora-do-padrao']).optional().catch(undefined),
  busca: z.string().trim().min(1).optional().catch(undefined),
  modalidadeId: z.uuid().optional().catch(undefined),
  especialidadeId: z.uuid().optional().catch(undefined),
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

export const Route = createFileRoute('/_app/exames')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'exames.ver')) return;
    if (deps.aba === 'fora-do-padrao') {
      await context.queryClient.ensureQueryData(consultaForaPadrao(deps));
      return;
    }
    // O item vem depois: o painel abre na hora, com o skeleton, enquanto ele carrega.
    if (deps.id)
      void context.queryClient.prefetchQuery(
        examesControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    await Promise.all([
      context.queryClient.ensureQueryData(examesControllerListarQueryOptions(consulta(deps))),
      context.queryClient.ensureQueryData(opcoesControllerListasQueryOptions()),
    ]);
  },
  head: () => ({ meta: [{ title: 'Exames | One' }] }),
  component: PaginaExames,
});

function PaginaExames() {
  const { sessao } = Route.useRouteContext();
  const { aba } = Route.useSearch();
  if (!pode(sessao, 'exames.ver')) return <SemPermissao tela="Exames" />;
  const podeEditar = pode(sessao, 'exames.editar');
  return aba === 'fora-do-padrao' ? (
    <ForaDoPadrao podeEditar={podeEditar} />
  ) : (
    <Exames podeEditar={podeEditar} />
  );
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
const OCULTAR_COM_PAINEL = ['subespecialidade', 'categoria'];
const nome = (ref: { nome: string } | null) => ref?.nome ?? '—';

function Exames({ podeEditar }: { podeEditar: boolean }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: pagina } = useSuspenseQuery(examesControllerListarQueryOptions(consulta(busca)));
  const { data: opcoes } = useSuspenseQuery(opcoesControllerListasQueryOptions());

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const filtrar = useCallback(
    (novos: Partial<Busca>) => ir((a) => ({ ...a, ...novos, pagina: undefined }), true),
    [ir],
  );
  const abrir = useCallback((id: string) => ir((a) => ({ ...a, id, novo: undefined })), [ir]);

  const colunas = useMemo(
    () => [
      coluna.accessor('nome', {
        header: 'Exame',
        cell: (info) => (
          <BotaoAbrir onAbrir={() => abrir(info.row.original.id)}>
            <span className="flex flex-col leading-snug">
              <span>{info.getValue()}</span>
              {info.row.original.codigo && (
                <span className="text-muted-foreground text-[13px] font-normal">
                  {info.row.original.codigo}
                </span>
              )}
            </span>
          </BotaoAbrir>
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
    [abrir],
  );

  const temFiltro = Boolean(busca.situacao || busca.modalidadeId || busca.especialidadeId);
  return (
    <ListaCadastro
      titulo="Exames"
      totalNoTitulo={false}
      abas={<AbasExames aba="padronizados" />}
      novo={
        podeEditar
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
              ...opcoes.modalidades.map((m) => ({ valor: m.id, rotulo: m.nome })),
            ]}
            className="flex-[1_1_160px] md:flex-[0_1_200px]"
          />
          <Select
            aria-label="Filtrar por especialidade"
            value={busca.especialidadeId ?? ''}
            onValueChange={(v) => filtrar({ especialidadeId: v || undefined })}
            opcoes={[
              { valor: '', rotulo: 'Todas as especialidades' },
              ...opcoes.especialidades.map((e) => ({ valor: e.id, rotulo: e.nome })),
            ]}
            className="flex-[1_1_160px] md:flex-[0_1_220px]"
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
      ocultarComPainel={OCULTAR_COM_PAINEL}
      itens={pagina.itens}
      getRowId={(e) => e.id}
      selecionadoId={busca.id}
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhum exame cadastrado.',
        texto: podeEditar
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
        })
      }
      onIrPara={(n) => ir((a) => ({ ...a, pagina: n }))}
      painel={
        busca.id || (busca.novo && podeEditar) ? (
          <Painel key={busca.id ?? 'novo'} id={busca.id} podeEditar={podeEditar} />
        ) : undefined
      }
    />
  );
}

const buscarExames = async (termo: string) => {
  const exames = await opcoesControllerExames({ query: { busca: termo } }).unwrap();
  return exames.map((e) => ({ valor: e.id, rotulo: e.nome, detalhe: e.modalidade }));
};

function Painel({ id, podeEditar }: { id?: string; podeEditar: boolean }) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const { data: opcoes } = useSuspenseQuery(opcoesControllerListasQueryOptions());
  const consulta = useQuery({
    ...examesControllerObterQueryOptions({ path: { id: id ?? '' } }),
    enabled: Boolean(id),
  });
  const exame = consulta.data;
  const fechar = () => void navigate({ search: (a) => ({ ...a, id: undefined, novo: undefined }) });
  if (id && !exame)
    return (
      <PainelCarregando
        onFechar={fechar}
        erro={consulta.isError}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );

  return (
    <PainelExame
      exame={exame}
      opcoes={opcoes}
      // O próprio exame não aparece como destino da quebra dele.
      buscarExames={async (termo) => (await buscarExames(termo)).filter((e) => e.valor !== id)}
      podeEditar={podeEditar}
      onFechar={fechar}
      onSalvar={async (body) => {
        let alvo = id;
        if (id) await examesControllerAtualizar({ path: { id }, body }).unwrap();
        else alvo = (await examesControllerCriar({ body }).unwrap()).id;
        await invalidarCatalogo(queryClient);
        void navigate({ search: (a) => ({ ...a, novo: undefined, id: alvo }), replace: true });
      }}
      onExcluir={
        id
          ? async () => {
              await examesControllerExcluir({ path: { id } }).unwrap();
              fechar();
              await invalidarCatalogo(queryClient);
            }
          : undefined
      }
      onCriarRegra={async (body) => {
        if (!id) return;
        await examesControllerCriarRegraQuebra({ path: { id }, body }).unwrap();
        await invalidarCatalogo(queryClient);
      }}
      onAtualizarRegra={async (regraId, body) => {
        if (!id) return;
        await examesControllerAtualizarRegraQuebra({ path: { id, regraId }, body }).unwrap();
        await invalidarCatalogo(queryClient);
      }}
      onExcluirRegra={async (regraId) => {
        if (!id) return;
        await examesControllerExcluirRegraQuebra({ path: { id, regraId } }).unwrap();
        await invalidarCatalogo(queryClient);
      }}
    />
  );
}

const cFora = createDataTableColumnHelper<DeParaValorItemDto>();
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** Estudos que chegam fora do padrão do cadastro, com quanto valem e o exame padronizado ligado. */
function ForaDoPadrao({ podeEditar }: { podeEditar: boolean }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: pagina } = useSuspenseQuery(consultaForaPadrao(busca));

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const filtrar = useCallback(
    (novos: Partial<Busca>) => ir((a) => ({ ...a, ...novos, pagina: undefined }), true),
    [ir],
  );
  const abrir = useCallback((id: string) => ir((a) => ({ ...a, id, novo: undefined })), [ir]);

  const colunas = useMemo(
    () => [
      cFora.accessor('estudoDescricao', {
        header: 'Descrição do estudo',
        cell: (i) => (
          <BotaoAbrir onAbrir={() => abrir(i.row.original.id)}>{i.getValue()}</BotaoAbrir>
        ),
      }),
      cFora.accessor('valores', {
        header: () => <span className="block text-right">Vale</span>,
        cell: (i) => (
          <span className="block text-right tabular-nums">{numero.format(i.getValue())}</span>
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
    [abrir],
  );

  return (
    <ListaCadastro
      titulo="Exames"
      totalNoTitulo={false}
      abas={<AbasExames aba="fora-do-padrao" />}
      novo={
        podeEditar
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
      ocultarComPainel={['destinoNome']}
      itens={pagina.itens}
      getRowId={(i) => i.id}
      selecionadoId={busca.id}
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
        busca.id || (busca.novo && podeEditar) ? (
          <PainelForaPadrao
            key={busca.id ?? 'novo'}
            id={busca.id}
            itens={pagina.itens}
            podeEditar={podeEditar}
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
  podeEditar,
}: {
  id?: string;
  itens: DeParaValorItemDto[];
  podeEditar: boolean;
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
  const fechar = () => void navigate({ search: (a) => ({ ...a, id: undefined, novo: undefined }) });
  if (id && !item)
    return (
      <PainelCarregando
        onFechar={fechar}
        erro={consulta.isError}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );

  return (
    <PainelExameForaPadrao
      item={item}
      buscarExames={buscarExames}
      podeEditar={podeEditar}
      onFechar={fechar}
      onSalvar={async (body) => {
        let alvo = id;
        if (id) await deParaValoresExameControllerAtualizar({ path: { id }, body }).unwrap();
        else alvo = (await deParaValoresExameControllerCriar({ body }).unwrap()).id;
        await invalidarCatalogo(queryClient);
        void navigate({ search: (a) => ({ ...a, novo: undefined, id: alvo }), replace: true });
      }}
      onExcluir={
        id
          ? async () => {
              await deParaValoresExameControllerExcluir({ path: { id } }).unwrap();
              fechar();
              await invalidarCatalogo(queryClient);
            }
          : undefined
      }
    />
  );
}
