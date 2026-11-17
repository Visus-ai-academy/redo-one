import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactNode, useCallback, useMemo } from 'react';
import { z } from 'zod';

import { CampoBusca } from '../../../components/busca/CampoBusca';
import { useBuscaComEspera } from '../../../components/busca/use-busca-com-espera';
import { ListaCadastro } from '../../../components/cadastro/ListaCadastro';
import { createDataTableColumnHelper } from '../../../components/data-table/columns';
import {
  buscaAoFecharPainel,
  hojeEmBrasilia,
  periodoCompleto,
  situacaoDaAusencia,
} from '../../../components/escala-ausencias/ausencias';
import { CelulaMedico, CelulaPeriodo } from '../../../components/escala-ausencias/celulas';
import { DetalheAusencia } from '../../../components/escala-ausencias/DetalheAusencia';
import { FiltroPeriodo } from '../../../components/escala-ausencias/FiltroPeriodo';
import {
  FormAusencia,
  type InicialAusencia,
} from '../../../components/escala-ausencias/FormAusencia';
import { useAusenciasPendentes } from '../../../components/escala-ausencias/use-ausencias-pendentes';
import { SemPermissao } from '../../../components/estado/estados';
import { Etiqueta } from '../../../components/etiqueta/Etiqueta';
import { PainelCarregando } from '../../../components/painel/PainelCarregando';
import { PainelLateral } from '../../../components/painel/PainelLateral';
import { Select } from '../../../components/select/Select';
import { useAvisos } from '../../../components/toast/use-avisos';
import { ausenciasControllerAprovar } from '../../../gen/clients/ausenciasControllerAprovar';
import { ausenciasControllerAtualizar } from '../../../gen/clients/ausenciasControllerAtualizar';
import { ausenciasControllerCriar } from '../../../gen/clients/ausenciasControllerCriar';
import { ausenciasControllerExcluir } from '../../../gen/clients/ausenciasControllerExcluir';
import { ausenciasControllerRecusar } from '../../../gen/clients/ausenciasControllerRecusar';
import { medicosEscalaControllerListar } from '../../../gen/clients/medicosEscalaControllerListar';
import { ausenciasControllerContarPendentesQueryKey } from '../../../gen/hooks/useAusenciasControllerContarPendentes';
import {
  ausenciasControllerListarQueryKey,
  ausenciasControllerListarQueryOptions,
} from '../../../gen/hooks/useAusenciasControllerListar';
import {
  ausenciasControllerObterQueryKey,
  ausenciasControllerObterQueryOptions,
} from '../../../gen/hooks/useAusenciasControllerObter';
import { frentesControllerListarQueryOptions } from '../../../gen/hooks/useFrentesControllerListar';
import { medicosEscalaControllerObterQueryOptions } from '../../../gen/hooks/useMedicosEscalaControllerObter';
import { tiposAusenciaControllerListarQueryOptions } from '../../../gen/hooks/useTiposAusenciaControllerListar';
import { turnosControllerListarQueryOptions } from '../../../gen/hooks/useTurnosControllerListar';
import type { AusenciaItemDto } from '../../../gen/types/AusenciaItemDto';
import { pode } from '../../../lib/permissoes';

const POR_PAGINA = 25;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const dia = z.string().regex(DIA).optional().catch(undefined);
const uuid = z.uuid().optional().catch(undefined);

const buscaSchema = z.object({
  busca: z.string().trim().min(1).optional().catch(undefined),
  situacao: z.enum(['pendente', 'aprovada', 'recusada']).optional().catch(undefined),
  tipoId: uuid,
  frenteId: uuid,
  de: dia,
  ate: dia,
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  id: uuid,
  novo: z.literal(1).optional().catch(undefined),
  editar: z.literal(1).optional().catch(undefined),
  /** Só para pré-preencher o "Nova ausência" vindo da Escala (com `frenteId` e `de`). */
  medicoId: uuid,
  turnoId: uuid,
});
type Busca = z.infer<typeof buscaSchema>;

const consulta = (b: Busca) => ({
  query: {
    busca: b.busca,
    situacao: b.situacao,
    tipoId: b.tipoId,
    frenteId: b.frenteId,
    de: b.de,
    ate: b.ate,
    pagina: b.pagina ?? 1,
    porPagina: POR_PAGINA,
  },
});

// Listas curtas da configuração da escala (inclusive inativos: filtram ausências antigas).
const TODOS = { query: { porPagina: 100 } };

export const Route = createFileRoute('/_app/escala/ausencias')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!pode(context.sessao, 'ausencias.ver')) return;
    const { queryClient } = context;
    if (deps.id)
      void queryClient.prefetchQuery(
        ausenciasControllerObterQueryOptions({ path: { id: deps.id } }),
      );
    if (deps.novo && deps.medicoId)
      void queryClient.prefetchQuery(
        medicosEscalaControllerObterQueryOptions({ path: { id: deps.medicoId } }),
      );
    await Promise.all([
      queryClient.ensureQueryData(ausenciasControllerListarQueryOptions(consulta(deps))),
      queryClient.ensureQueryData(tiposAusenciaControllerListarQueryOptions(TODOS)),
      queryClient.ensureQueryData(frentesControllerListarQueryOptions(TODOS)),
      queryClient.ensureQueryData(turnosControllerListarQueryOptions(TODOS)),
    ]);
  },
  head: () => ({ meta: [{ title: 'Ausências | One' }] }),
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return pode(sessao, 'ausencias.ver') ? <Ausencias /> : <SemPermissao tela="Ausências" />;
}

/** Médicos ativos que casam com o termo, para lançar ausência. */
async function buscarMedicos(termo: string) {
  const { itens } = await medicosEscalaControllerListar({
    query: { busca: termo, ativo: true, porPagina: 20 },
  }).unwrap();
  return itens.map((m) => ({ valor: m.id, rotulo: m.nome }));
}

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

const coluna = createDataTableColumnHelper<AusenciaItemDto>();
const OCULTAR_COM_PAINEL = ['origem', 'tipo'];

/** Mantém o painel aberto atualizado, a lista e o contador de pendentes do menu. */
function useAtualizarAusencias() {
  const queryClient = useQueryClient();
  return (id?: string) =>
    Promise.all([
      id &&
        queryClient.invalidateQueries({
          queryKey: ausenciasControllerObterQueryKey({ path: { id } }),
        }),
      queryClient.invalidateQueries({ queryKey: ausenciasControllerListarQueryKey() }),
      queryClient.invalidateQueries({ queryKey: ausenciasControllerContarPendentesQueryKey() }),
    ]);
}

function Ausencias() {
  const { sessao } = Route.useRouteContext();
  const podeCriar = pode(sessao, 'ausencias.criar');
  const podeEditar = pode(sessao, 'ausencias.editar');
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: pagina } = useSuspenseQuery(ausenciasControllerListarQueryOptions(consulta(busca)));
  const { data: tipos } = useSuspenseQuery(tiposAusenciaControllerListarQueryOptions(TODOS));
  const { data: frentes } = useSuspenseQuery(frentesControllerListarQueryOptions(TODOS));
  const pendentes = useAusenciasPendentes(pode(sessao, 'ausencias.aprovar'));
  const hoje = hojeEmBrasilia();

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const filtrar = useCallback(
    (novos: Partial<Busca>) => ir((a) => ({ ...a, ...novos, pagina: undefined }), true),
    [ir],
  );
  const abrir = useCallback(
    (id: string) =>
      ir((a) => ({
        ...a,
        id,
        novo: undefined,
        editar: undefined,
        medicoId: undefined,
        turnoId: undefined,
      })),
    [ir],
  );
  const fechar = () => ir(buscaAoFecharPainel);

  const colunas = useMemo(
    () => [
      coluna.accessor((a) => a.medico.nome, {
        id: 'medico',
        header: 'Médico',
        cell: (info) => (
          <CelulaMedico ausencia={info.row.original} onAbrir={() => abrir(info.row.original.id)} />
        ),
      }),
      coluna.accessor((a) => a.tipo.nome, {
        id: 'tipo',
        header: 'Tipo',
        cell: (info) => <ComCor cor={info.row.original.tipo.cor}>{info.getValue()}</ComCor>,
      }),
      coluna.accessor('dataInicio', {
        id: 'periodo',
        header: 'Período',
        cell: (info) => <CelulaPeriodo ausencia={info.row.original} hoje={hoje} />,
      }),
      coluna.accessor('situacao', {
        header: 'Situação',
        cell: (info) => {
          const s = situacaoDaAusencia(info.getValue());
          return <Etiqueta tom={s.tom}>{s.texto}</Etiqueta>;
        },
      }),
      coluna.accessor('origem', {
        header: 'Origem',
        cell: (info) =>
          info.getValue() === 'medico' ? (
            'Pedido pelo portal'
          ) : (
            <span className="text-muted-foreground">Lançada pela gestão</span>
          ),
      }),
    ],
    [abrir, hoje],
  );

  // A busca mora entre os filtros (e não no `busca` da lista) para encolher e caber numa linha.
  const [termo, setTermo] = useBuscaComEspera(
    busca.busca,
    useCallback((texto: string | undefined) => filtrar({ busca: texto }), [filtrar]),
  );
  const temFiltro = [
    busca.busca,
    busca.situacao,
    busca.tipoId,
    busca.frenteId,
    busca.de,
    busca.ate,
  ].some((valor) => valor !== undefined);

  return (
    <ListaCadastro
      titulo="Ausências"
      novo={
        podeCriar
          ? {
              rotulo: 'Nova ausência',
              onClick: () => ir((a) => ({ ...a, id: undefined, editar: undefined, novo: 1 })),
            }
          : undefined
      }
      temFiltro={temFiltro}
      filtros={
        <>
          <CampoBusca
            rotulo="Buscar médico"
            placeholder="Nome do médico"
            valor={termo}
            onMudar={setTermo}
            className="min-w-0 flex-[1_1_220px] xl:flex-[1_1_140px]"
          />
          <Select
            aria-label="Filtrar por situação"
            value={busca.situacao ?? ''}
            onValueChange={(valor) =>
              filtrar({ situacao: (valor || undefined) as Busca['situacao'] })
            }
            opcoes={[
              { valor: '', rotulo: 'Todas as situações' },
              {
                valor: 'pendente',
                rotulo: pendentes ? `Pendentes (${pendentes})` : 'Pendentes',
              },
              { valor: 'aprovada', rotulo: 'Aprovadas' },
              { valor: 'recusada', rotulo: 'Recusadas' },
            ]}
            className="flex-[1_1_184px] xl:flex-[0_0_184px]"
          />
          <Select
            aria-label="Filtrar por tipo"
            value={busca.tipoId ?? ''}
            onValueChange={(valor) => filtrar({ tipoId: valor || undefined })}
            opcoes={[
              { valor: '', rotulo: 'Todos os tipos' },
              ...tipos.itens.map((t) => ({ valor: t.id, rotulo: t.nome })),
            ]}
            className="w-auto min-w-[160px] flex-[1_1_auto] xl:flex-[0_0_auto]"
          />
          <Select
            aria-label="Filtrar por escala"
            value={busca.frenteId ?? ''}
            onValueChange={(valor) => filtrar({ frenteId: valor || undefined })}
            opcoes={[
              { valor: '', rotulo: 'Todas as escalas' },
              ...frentes.itens.map((f) => ({ valor: f.id, rotulo: f.rotulo })),
            ]}
            className="w-auto min-w-[160px] flex-[1_1_auto] xl:flex-[0_0_auto]"
          />
          <FiltroPeriodo
            de={busca.de}
            ate={busca.ate}
            hoje={hoje}
            onMudar={filtrar}
            className="flex-[1_1_180px] xl:flex-[0_0_180px]"
          />
        </>
      }
      colunas={colunas}
      ocultarComPainel={OCULTAR_COM_PAINEL}
      itens={pagina.itens}
      getRowId={(item) => item.id}
      selecionadoId={busca.id}
      onAbrir={abrir}
      pagina={pagina.pagina}
      porPagina={pagina.porPagina}
      total={pagina.total}
      vazio={{
        titulo: 'Nenhuma ausência neste período.',
        texto: podeCriar
          ? 'Lance férias, congressos e folgas para a escala saber quem não está disponível.'
          : 'Quem gere a escala lança as ausências; os pedidos do portal também aparecem aqui.',
      }}
      onFiltrar={filtrar}
      onLimparFiltros={() =>
        filtrar({
          busca: undefined,
          situacao: undefined,
          tipoId: undefined,
          frenteId: undefined,
          de: undefined,
          ate: undefined,
        })
      }
      onIrPara={(numero) => ir((a) => ({ ...a, pagina: numero }))}
      painel={
        busca.novo && podeCriar ? (
          <PainelNova
            key="novo"
            busca={busca}
            onFechar={fechar}
            onCriadas={(ids) =>
              ids.length === 1
                ? ir(
                    (a) => ({
                      ...a,
                      novo: undefined,
                      medicoId: undefined,
                      turnoId: undefined,
                      id: ids[0],
                    }),
                    true,
                  )
                : fechar()
            }
          />
        ) : busca.id && busca.editar && podeEditar ? (
          <PainelEdicao
            key={`editar-${busca.id}`}
            id={busca.id}
            onFechar={() => ir((a) => ({ ...a, editar: undefined }))}
          />
        ) : busca.id ? (
          <PainelDaAusencia
            key={busca.id}
            id={busca.id}
            onEditar={() => ir((a) => ({ ...a, editar: 1 }))}
            onFechar={fechar}
          />
        ) : undefined
      }
    />
  );
}

/** Tipos ativos, escalas e turnos ativos para o formulário. */
function useOpcoesDoFormulario() {
  const { data: tipos } = useSuspenseQuery(tiposAusenciaControllerListarQueryOptions(TODOS));
  const { data: frentes } = useSuspenseQuery(frentesControllerListarQueryOptions(TODOS));
  const { data: turnos } = useSuspenseQuery(turnosControllerListarQueryOptions(TODOS));
  return {
    tipos: tipos.itens.filter((t) => t.ativo).map((t) => ({ valor: t.id, rotulo: t.nome })),
    frentes: frentes.itens.filter((f) => f.ativo).map((f) => ({ valor: f.id, rotulo: f.rotulo })),
    turnos: turnos.itens.filter((t) => t.ativo).map((t) => ({ valor: t.id, rotulo: t.nome })),
  };
}

function PainelNova({
  busca,
  onFechar,
  onCriadas,
}: {
  busca: Busca;
  onFechar: () => void;
  onCriadas: (ids: string[]) => void;
}) {
  const { sucesso } = useAvisos();
  const atualizar = useAtualizarAusencias();
  const opcoes = useOpcoesDoFormulario();
  // Vindo da Escala ("Definir ausência"): o nome do médico vem de /escala/medicos.
  const medico = useQuery({
    ...medicosEscalaControllerObterQueryOptions({ path: { id: busca.medicoId ?? '' } }),
    enabled: Boolean(busca.medicoId),
    retry: false,
  });
  if (medico.isLoading) return <PainelCarregando onFechar={onFechar} />;

  const inicial: InicialAusencia = {
    medico: medico.data ? { valor: medico.data.id, rotulo: medico.data.nome } : null,
    frenteIds: busca.frenteId ? [busca.frenteId] : [],
    turnoIds: busca.turnoId ? [busca.turnoId] : [],
    de: busca.de,
  };

  return (
    <FormAusencia
      {...opcoes}
      inicial={inicial}
      aviso={medico.isError ? 'Médico não encontrado; escolha outro.' : undefined}
      buscarMedicos={buscarMedicos}
      onFechar={onFechar}
      onSalvar={async (dados) => {
        const { ids } = await ausenciasControllerCriar({ body: dados }).unwrap();
        sucesso(ids.length === 1 ? 'Ausência lançada.' : `${ids.length} ausências lançadas.`);
        await atualizar();
        onCriadas(ids);
      }}
    />
  );
}

function PainelEdicao({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { sucesso } = useAvisos();
  const atualizar = useAtualizarAusencias();
  const opcoes = useOpcoesDoFormulario();
  const consulta = useQuery(ausenciasControllerObterQueryOptions({ path: { id } }));
  const ausencia = consulta.data;
  if (!ausencia)
    return (
      <PainelCarregando
        onFechar={onFechar}
        erro={consulta.isError}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );
  return (
    <FormAusencia
      {...opcoes}
      ausencia={ausencia}
      buscarMedicos={buscarMedicos}
      onFechar={onFechar}
      onSalvar={async ({ medicoIds: _medico, ...dados }) => {
        await ausenciasControllerAtualizar({ path: { id }, body: dados }).unwrap();
        sucesso('Ausência salva.');
        await atualizar(id);
        onFechar();
      }}
    />
  );
}

function PainelDaAusencia({
  id,
  onEditar,
  onFechar,
}: {
  id: string;
  onEditar: () => void;
  onFechar: () => void;
}) {
  const { sessao } = Route.useRouteContext();
  const { sucesso } = useAvisos();
  const atualizar = useAtualizarAusencias();
  const consulta = useQuery(ausenciasControllerObterQueryOptions({ path: { id } }));
  const ausencia = consulta.data;
  if (!ausencia)
    return (
      <PainelCarregando
        onFechar={onFechar}
        erro={consulta.isError}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );
  return (
    <PainelLateral
      titulo={ausencia.medico.nome}
      subtitulo={`${ausencia.tipo.nome}, ${periodoCompleto(ausencia)}`}
      onFechar={onFechar}
    >
      <DetalheAusencia
        ausencia={ausencia}
        podeEditar={pode(sessao, 'ausencias.editar')}
        podeExcluir={pode(sessao, 'ausencias.excluir')}
        podeAprovar={pode(sessao, 'ausencias.aprovar')}
        onEditar={onEditar}
        onAprovar={async () => {
          await ausenciasControllerAprovar({ path: { id } }).unwrap();
          sucesso('Ausência aprovada. Já vale na escala.');
          await atualizar(id);
        }}
        onRecusar={async (motivo) => {
          await ausenciasControllerRecusar({ path: { id }, body: { motivo } }).unwrap();
          sucesso('Pedido recusado.');
          await atualizar(id);
        }}
        onExcluir={async () => {
          await ausenciasControllerExcluir({ path: { id } }).unwrap();
          sucesso('Ausência excluída.');
          onFechar();
          await atualizar();
        }}
      />
    </PainelLateral>
  );
}
