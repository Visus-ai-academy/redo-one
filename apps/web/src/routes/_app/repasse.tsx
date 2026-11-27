import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { Abas } from '../../components/abas/Abas';
import { LinkDaLinha } from '../../components/data-table/link-da-linha';
import { EstadoDoErro } from '../../components/estado/EstadoDoErro';
import { SemPermissao } from '../../components/estado/estados';
import { PainelCarregando } from '../../components/painel/PainelCarregando';
import { CabecalhoRepasse } from '../../components/repasse/CabecalhoRepasse';
import { LaudosDoDemonstrativo } from '../../components/repasse/LaudosDoDemonstrativo';
import { ListaAdicionaisRepasse } from '../../components/repasse/ListaAdicionaisRepasse';
import {
  type AbaDemonstrativo,
  PainelDemonstrativo,
} from '../../components/repasse/PainelDemonstrativo';
import { PainelLancarAdicional } from '../../components/repasse/PainelLancarAdicional';
import {
  type OrdemRepasse,
  TabelaMedicosRepasse,
} from '../../components/repasse/TabelaMedicosRepasse';
import { textoDoArranjo } from '../../components/repasse-medico/fonte-precos';
import { CamposCarregando } from '../../components/skeleton/CamposCarregando';
import { ComEsqueleto } from '../../components/skeleton/ComEsqueleto';
import { useFaseDoCarregamento } from '../../components/skeleton/use-fase-do-carregamento';
import { useAvisos } from '../../components/toast/use-avisos';
import { ResponseError } from '../../gen/.kubb/client';
import { repasseConsultasControllerMedicos } from '../../gen/clients/repasseConsultasControllerMedicos';
import { repasseConsultasControllerTarifas } from '../../gen/clients/repasseConsultasControllerTarifas';
import { repasseControllerCancelar } from '../../gen/clients/repasseControllerCancelar';
import { repasseControllerLancar } from '../../gen/clients/repasseControllerLancar';
import { repasseControllerRecalcular } from '../../gen/clients/repasseControllerRecalcular';
import { repasseConsultasControllerCompetenciaQueryOptions } from '../../gen/hooks/useRepasseConsultasControllerCompetencia';
import { repasseConsultasControllerCompetenciasQueryOptions } from '../../gen/hooks/useRepasseConsultasControllerCompetencias';
import { repasseConsultasControllerDemonstrativoQueryOptions } from '../../gen/hooks/useRepasseConsultasControllerDemonstrativo';
import { repasseConsultasControllerDemonstrativosQueryOptions } from '../../gen/hooks/useRepasseConsultasControllerDemonstrativos';
import { repasseConsultasControllerLaudosQueryOptions } from '../../gen/hooks/useRepasseConsultasControllerLaudos';
import { repasseControllerAdicionaisQueryOptions } from '../../gen/hooks/useRepasseControllerAdicionais';
import type { CompetenciaComRepasseDto } from '../../gen/types/CompetenciaComRepasseDto';
import { mesDeBrasilia } from '../../lib/datas';
import { pode } from '../../lib/permissoes';
import { competenciasDoLancamento, nomeCompetencia } from '../../lib/repasse';

const POR_PAGINA = 25;
/** Os laudos do detalhe, no painel lateral. */
const LAUDOS_POR_PAGINA = 10;
const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;
const ORDENS = [
  'medico',
  'volume',
  'exames',
  'adicionais',
  'bruto',
  'retencoes',
  'liquido',
  'semPreco',
] as const;

const pagina = z.coerce.number().int().min(1).optional().catch(undefined);
const buscaSchema = z.object({
  competencia: z.string().regex(COMPETENCIA).optional().catch(undefined),
  /** Versão guardada; sem ela, a atual. */
  versao: z.uuid().optional().catch(undefined),
  aba: z.literal('adicionais').optional().catch(undefined),
  busca: z.string().trim().min(1).optional().catch(undefined),
  situacao: z.enum(['sem_preco', 'com_preco']).optional().catch(undefined),
  ordem: z.enum(ORDENS).optional().catch(undefined),
  direcao: z.enum(['asc', 'desc']).optional().catch(undefined),
  pagina,
  /** Demonstrativo aberto no painel. */
  id: z.uuid().optional().catch(undefined),
  detalhe: z.enum(['dias', 'adicionais', 'laudos']).optional().catch(undefined),
  paginaLaudos: pagina,
  /** Filtro dos adicionais: o médico (com o nome, para o campo mostrar ao recarregar). */
  medico: z.uuid().optional().catch(undefined),
  medicoNome: z.string().max(200).optional().catch(undefined),
  tipo: z.enum(['avulso', 'plantao', 'peer_review']).optional().catch(undefined),
  paginaAdicionais: pagina,
  lancar: z.literal(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const escolherCompetencia = (b: Busca, lista: CompetenciaComRepasseDto[]) =>
  b.competencia ?? lista[0]?.competencia ?? mesDeBrasilia(new Date());

const consultaDemonstrativos = (b: Busca, competencia: string, versao: string | undefined) => ({
  path: { competencia },
  query: {
    versao,
    busca: b.busca,
    situacao: b.situacao ?? ('todas' as const),
    ordem: b.ordem ?? ('medico' as const),
    direcao: b.direcao ?? ('asc' as const),
    pagina: b.pagina ?? 1,
    porPagina: POR_PAGINA,
  },
});
const consultaAdicionais = (b: Busca, competencia: string) => ({
  query: {
    competencia,
    medicoId: b.medico,
    tipo: b.tipo,
    pagina: b.paginaAdicionais ?? 1,
    porPagina: POR_PAGINA,
  },
});

export const Route = createFileRoute('/_app/repasse')({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient, sessao }, deps, cause }) => {
    if (!pode(sessao, 'repasse.ver')) return;
    // O demonstrativo vem depois: o painel abre na hora, com o skeleton, enquanto ele carrega.
    if (deps.id)
      void queryClient.prefetchQuery(
        repasseConsultasControllerDemonstrativoQueryOptions({ path: { id: deps.id } }),
      );
    const lista = await queryClient.ensureQueryData(
      repasseConsultasControllerCompetenciasQueryOptions(),
    );
    const competencia = escolherCompetencia(deps, lista);
    const dados = await queryClient.ensureQueryData(
      repasseConsultasControllerCompetenciaQueryOptions({ path: { competencia } }),
    );
    // Na própria tela (filtro, página, painel), a lista busca sozinha e deixa a de antes à vista.
    if (cause === 'stay') return;
    await (deps.aba === 'adicionais'
      ? queryClient.ensureQueryData(
          repasseControllerAdicionaisQueryOptions(consultaAdicionais(deps, competencia)),
        )
      : queryClient.ensureQueryData(
          repasseConsultasControllerDemonstrativosQueryOptions(
            consultaDemonstrativos(deps, competencia, deps.versao ?? dados.atual?.id),
          ),
        ));
  },
  head: () => ({ meta: [{ title: 'Repasse · One' }] }),
  component: PaginaRepasse,
});

function PaginaRepasse() {
  const { sessao } = Route.useRouteContext();
  return pode(sessao, 'repasse.ver') ? <Repasse /> : <SemPermissao tela="Repasse" />;
}

const RECALCULO_EM_ANDAMENTO_MS = 10_000;

function Repasse() {
  const { sessao } = Route.useRouteContext();
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const { data: competencias } = useSuspenseQuery(
    repasseConsultasControllerCompetenciasQueryOptions(),
  );
  const competencia = escolherCompetencia(busca, competencias);
  const consultaCompetencia = useQuery({
    ...repasseConsultasControllerCompetenciaQueryOptions({ path: { competencia } }),
    placeholderData: keepPreviousData,
    // Recálculo pedido: a versão nova aparece sozinha quando o job termina.
    refetchInterval: (q) => (q.state.data?.recalculoPendente ? RECALCULO_EM_ANDAMENTO_MS : false),
    refetchIntervalInBackground: false,
  });
  const dados =
    consultaCompetencia.data?.competencia === competencia ? consultaCompetencia.data : undefined;

  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const atualizar = (prefixo: string) =>
    queryClient.invalidateQueries({ queryKey: [{ url: prefixo }] });

  return (
    // No computador, a tela cabe na janela: a lista rola por dentro, com a paginação à vista.
    <div className="flex flex-col gap-5 md:h-[calc(100dvh-4rem)]">
      <CabecalhoRepasse
        competencias={competencias}
        competencia={competencia}
        dados={dados}
        versaoId={busca.versao}
        podeRecalcular={pode(sessao, 'repasse.recalcular')}
        podeVerAvisos={pode(sessao, 'avisos.ver')}
        onCompetencia={(c) =>
          ir((a) => ({
            ...a,
            competencia: c,
            versao: undefined,
            pagina: undefined,
            paginaAdicionais: undefined,
            id: undefined,
            detalhe: undefined,
            paginaLaudos: undefined,
          }))
        }
        onVersao={(versao) =>
          ir((a) => ({ ...a, versao, pagina: undefined, id: undefined, detalhe: undefined }))
        }
        onRecalcular={async (motivo) => {
          await repasseControllerRecalcular({ path: { competencia }, body: { motivo } }).unwrap();
          await atualizar('/repasse/competencias/:competencia');
          avisos.sucesso('Recálculo pedido. A versão nova aparece aqui quando terminar.');
        }}
      />
      {consultaCompetencia.isError && !dados ? (
        <EstadoDoErro
          erro={consultaCompetencia.error}
          oQue="o repasse"
          onTentarDeNovo={() => void consultaCompetencia.refetch()}
        />
      ) : (
        <>
          <Abas
            abas={[
              { valor: 'medicos', rotulo: 'Médicos' },
              { valor: 'adicionais', rotulo: 'Adicionais' },
            ]}
            valor={busca.aba ?? 'medicos'}
            onMudar={(aba) =>
              ir((a) => ({
                ...a,
                aba: aba === 'adicionais' ? 'adicionais' : undefined,
                id: undefined,
                detalhe: undefined,
                lancar: undefined,
              }))
            }
            aria-label="Repasse"
          />
          {busca.aba === 'adicionais' ? (
            <AbaAdicionais competencia={competencia} status={dados?.status} />
          ) : (
            <AbaMedicos competencia={competencia} versao={busca.versao ?? dados?.atual?.id} />
          )}
        </>
      )}
    </div>
  );
}

function AbaMedicos({ competencia, versao }: { competencia: string; versao: string | undefined }) {
  const { sessao } = Route.useRouteContext();
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const lista = useQuery({
    ...repasseConsultasControllerDemonstrativosQueryOptions(
      consultaDemonstrativos(busca, competencia, versao),
    ),
    placeholderData: keepPreviousData,
  });
  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const filtrar = useCallback(
    (f: { busca?: string | undefined; situacao?: 'todas' | 'sem_preco' | 'com_preco' }) =>
      ir(
        (a) => ({
          ...a,
          ...('busca' in f && { busca: f.busca }),
          ...(f.situacao && { situacao: f.situacao === 'todas' ? undefined : f.situacao }),
          pagina: undefined,
        }),
        true,
      ),
    [ir],
  );
  const ordenar = useCallback(
    (o: { coluna: OrdemRepasse; direcao: 'asc' | 'desc' }) =>
      ir((a) => ({
        ...a,
        ordem: o.coluna === 'medico' ? undefined : o.coluna,
        direcao: o.coluna === 'medico' && o.direcao === 'asc' ? undefined : o.direcao,
        pagina: undefined,
      })),
    [ir],
  );
  const renderNome = useCallback(
    (d: { id: string; medico: string }) => (
      <LinkDaLinha
        from={Route.fullPath}
        to="."
        search={(a: Busca) => ({ ...a, id: d.id, detalhe: undefined, paginaLaudos: undefined })}
      >
        {d.medico}
      </LinkDaLinha>
    ),
    [],
  );
  const vazia = useMemo(
    () => ({
      itens: [],
      total: 0,
      pagina: 1,
      porPagina: POR_PAGINA,
      totais: {
        medicos: 0,
        volume: 0,
        examesCentavos: 0,
        adicionaisCentavos: 0,
        brutoCentavos: 0,
        retencoesCentavos: 0,
        liquidoCentavos: 0,
        gruposSemPreco: 0,
        laudosSemPreco: 0,
      },
    }),
    [],
  );

  return (
    <>
      <TabelaMedicosRepasse
        pagina={lista.data ?? vazia}
        busca={busca.busca}
        situacao={busca.situacao ?? 'todas'}
        ordenacao={{ coluna: busca.ordem ?? 'medico', direcao: busca.direcao ?? 'asc' }}
        recarregando={lista.isPlaceholderData}
        erro={
          lista.isError && !lista.data
            ? { erro: lista.error, onTentarDeNovo: () => void lista.refetch() }
            : undefined
        }
        renderNome={renderNome}
        selecionadoId={busca.id}
        onFiltrar={filtrar}
        onOrdenar={ordenar}
        onIrPara={(n) => ir((a) => ({ ...a, pagina: n }))}
      />
      {busca.id && (
        <DetalheDoDemonstrativo
          key={busca.id}
          id={busca.id}
          podeDefinirPreco={pode(sessao, 'medicos.ver')}
          onFechar={() =>
            ir((a) => ({ ...a, id: undefined, detalhe: undefined, paginaLaudos: undefined }))
          }
        />
      )}
    </>
  );
}

function DetalheDoDemonstrativo({
  id,
  podeDefinirPreco,
  onFechar,
}: {
  id: string;
  podeDefinirPreco: boolean;
  onFechar: () => void;
}) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const consulta = useQuery(repasseConsultasControllerDemonstrativoQueryOptions({ path: { id } }));
  const d = consulta.data;
  const fase = useFaseDoCarregamento(!d);
  if (!d || fase !== 'conteudo')
    return (
      <PainelCarregando
        largura="larga"
        onFechar={onFechar}
        erro={consulta.error ?? undefined}
        oQue="o demonstrativo"
        voltar={{ to: '/repasse', rotulo: 'Voltar para Repasse' }}
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );
  const aba: AbaDemonstrativo = busca.detalhe ?? 'grupos';
  return (
    <PainelDemonstrativo
      demonstrativo={d}
      aba={aba}
      onAba={(nova) =>
        void navigate({
          search: (a) => ({
            ...a,
            detalhe: nova === 'grupos' ? undefined : nova,
            paginaLaudos: undefined,
          }),
          replace: true,
        })
      }
      onFechar={onFechar}
      definirPreco={(medicoId, arranjo) =>
        podeDefinirPreco ? (
          // A aba Repasse do cadastro do médico, com o arranjo do grupo já em "Incluir preço".
          <Link
            to="/medicos"
            search={{
              id: medicoId,
              aba: 'repasse',
              parte: 'precos',
              arranjo:
                arranjo.modalidadeId &&
                arranjo.especialidadeId &&
                arranjo.categoriaId &&
                arranjo.prioridadeId
                  ? textoDoArranjo({
                      modalidadeId: arranjo.modalidadeId,
                      especialidadeId: arranjo.especialidadeId,
                      categoriaId: arranjo.categoriaId,
                      prioridadeId: arranjo.prioridadeId,
                    })
                  : undefined,
            }}
            className="underline underline-offset-2"
          >
            Definir preço
          </Link>
        ) : null
      }
      laudos={<LaudosDaAba id={id} />}
    />
  );
}

function LaudosDaAba({ id }: { id: string }) {
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const consulta = useQuery({
    ...repasseConsultasControllerLaudosQueryOptions({
      path: { id },
      query: { pagina: busca.paginaLaudos ?? 1, porPagina: LAUDOS_POR_PAGINA },
    }),
    placeholderData: keepPreviousData,
    // Dado de paciente: não fica no cache depois que a aba fecha.
    gcTime: 0,
  });
  if (consulta.isError && !consulta.data)
    return (
      <EstadoDoErro
        erro={consulta.error}
        oQue="os laudos"
        onTentarDeNovo={() => void consulta.refetch()}
      />
    );
  return (
    <ComEsqueleto carregando={!consulta.data} esqueleto={<CamposCarregando quantidade={5} />}>
      {() =>
        consulta.data && (
          <LaudosDoDemonstrativo
            pagina={consulta.data}
            recarregando={consulta.isPlaceholderData}
            onIrPara={(n) =>
              void navigate({ search: (a) => ({ ...a, paginaLaudos: n }), replace: true })
            }
          />
        )
      }
    </ComEsqueleto>
  );
}

const buscarMedicos = async (termo: string, sinal?: AbortSignal) => {
  const medicos = await repasseConsultasControllerMedicos({
    query: { busca: termo || undefined },
    signal: sinal,
  }).unwrap();
  return medicos.map((m) => ({ valor: m.id, rotulo: m.nome }));
};

const tarifas = (competencia: string) =>
  repasseConsultasControllerTarifas({ query: { competencia } }).unwrap();

function AbaAdicionais({
  competencia,
  status,
}: {
  competencia: string;
  status: 'aberta' | 'fechada' | undefined;
}) {
  const { sessao } = Route.useRouteContext();
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const avisos = useAvisos();
  const { data: competencias } = useSuspenseQuery(
    repasseConsultasControllerCompetenciasQueryOptions(),
  );
  const lista = useQuery({
    ...repasseControllerAdicionaisQueryOptions(consultaAdicionais(busca, competencia)),
    placeholderData: keepPreviousData,
  });
  const ir = useCallback(
    (mudar: (atual: Busca) => Busca, replace = false) => void navigate({ search: mudar, replace }),
    [navigate],
  );
  const podeLancar = pode(sessao, 'repasse.adicional.lancar');
  const atualizar = () =>
    Promise.all(
      ['/repasse/adicionais', '/repasse/competencias/:competencia'].map((url) =>
        queryClient.invalidateQueries({ queryKey: [{ url }] }),
      ),
    );

  const opcoes = competenciasDoLancamento(competencias, new Date());
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

  return (
    <>
      <ListaAdicionaisRepasse
        pagina={lista.data ?? { itens: [], total: 0, pagina: 1, porPagina: POR_PAGINA }}
        medico={busca.medico ? { valor: busca.medico, rotulo: busca.medicoNome ?? '' } : null}
        tipo={busca.tipo}
        buscarMedicos={buscarMedicos}
        podeLancar={podeLancar}
        podeCancelar={podeLancar && status === 'aberta'}
        recarregando={lista.isPlaceholderData}
        erro={
          lista.isError && !lista.data
            ? { erro: lista.error, onTentarDeNovo: () => void lista.refetch() }
            : undefined
        }
        onFiltrar={(f) =>
          ir(
            (a) => ({
              ...a,
              ...('medico' in f && { medico: f.medico?.valor, medicoNome: f.medico?.rotulo }),
              ...('tipo' in f && { tipo: f.tipo }),
              paginaAdicionais: undefined,
            }),
            true,
          )
        }
        onIrPara={(n) => ir((a) => ({ ...a, paginaAdicionais: n }))}
        onLancar={() => ir((a) => ({ ...a, lancar: 1 }))}
        onCancelar={async (id, motivo) => {
          try {
            await repasseControllerCancelar({ path: { id }, body: { motivo } }).unwrap();
          } catch (erro) {
            if (ResponseError.is(erro) && erro.status === 409) {
              await atualizar();
              // Outra pessoa já cancelou: a lista mostra o estado de agora, sem erro para resolver.
              if ((erro.data as { codigo?: string } | undefined)?.codigo === 'ja_cancelado') {
                avisos.sucesso('O lançamento já estava cancelado.');
                return;
              }
            }
            throw erro;
          }
          await atualizar();
          avisos.sucesso('Lançamento cancelado.');
        }}
      />
      {busca.lancar && podeLancar && (
        <PainelLancarAdicional
          competencias={opcoes}
          competenciaInicial={competencia}
          medicoInicial={
            busca.medico ? { valor: busca.medico, rotulo: busca.medicoNome ?? '' } : undefined
          }
          hoje={hoje}
          podeLancarNaFechada={pode(sessao, 'repasse.adicional.lancar_fechada')}
          tarifas={tarifas}
          buscarMedicos={buscarMedicos}
          onFechar={() => ir((a) => ({ ...a, lancar: undefined }))}
          onSalvar={async (dados) => {
            const r = await repasseControllerLancar({ body: dados }).unwrap();
            await atualizar();
            ir((a) => ({ ...a, lancar: undefined }), true);
            avisos.sucesso(
              r.recalculoId
                ? `Adicional lançado em ${nomeCompetencia(r.competencia)}. O recálculo foi pedido.`
                : r.competencia !== dados.competencia
                  ? `Adicional lançado em ${nomeCompetencia(r.competencia)}, a próxima aberta.`
                  : 'Adicional lançado.',
            );
          }}
        />
      )}
    </>
  );
}
