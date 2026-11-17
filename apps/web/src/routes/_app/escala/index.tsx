import { keepPreviousData, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';

import { aplicarRecorte } from '../../../components/escala/agrupar';
import { buscarMedicosDaEscala } from '../../../components/escala/buscar-medicos';
import {
  hojeEmBrasilia,
  janelaDoModo,
  type ModoEscala,
} from '../../../components/escala/calendario';
import { PaineisEscala, type PainelAberto } from '../../../components/escala/PaineisEscala';
import {
  type FiltrosEscala,
  type NomesDoCatalogo,
  TelaEscala,
} from '../../../components/escala/TelaEscala';
import { SemPermissao } from '../../../components/estado/estados';
import { ausenciasControllerListarQueryOptions } from '../../../gen/hooks/useAusenciasControllerListar';
import { classificacoesEscalaControllerListarQueryOptions } from '../../../gen/hooks/useClassificacoesEscalaControllerListar';
import { escopoApiControllerMeuQueryOptions } from '../../../gen/hooks/useEscopoApiControllerMeu';
import { frentesControllerListarQueryOptions } from '../../../gen/hooks/useFrentesControllerListar';
import { medicosEscalaControllerObterQueryOptions } from '../../../gen/hooks/useMedicosEscalaControllerObter';
import { ocorrenciasControllerListarQueryOptions } from '../../../gen/hooks/useOcorrenciasControllerListar';
import { turnosControllerListarQueryOptions } from '../../../gen/hooks/useTurnosControllerListar';
import type { AvisoConflitoDto } from '../../../gen/types/AvisoConflitoDto';
import { pode, podeNaTela } from '../../../lib/permissoes';

const DIA = /^\d{4}-\d{2}-\d{2}$/;
// Lista (`["…"]`) ou um id só: um uuid simples na URL chega como texto, não como lista.
const ids = z
  .preprocess((v) => (typeof v === 'string' ? [v] : v), z.array(z.uuid()).min(1))
  .optional()
  .catch(undefined);

const buscaSchema = z.object({
  modo: z.enum(['semana', 'mes', 'medico', 'ausencias']).optional().catch(undefined),
  agrupar: z.enum(['frente', 'turno']).optional().catch(undefined),
  data: z.string().regex(DIA).optional().catch(undefined),
  medicoId: z.uuid().optional().catch(undefined),
  frenteIds: ids,
  turnoIds: ids,
  busca: z.string().trim().min(1).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).optional().catch(undefined),
  /** Sáb e dom à mostra mesmo vazios. */
  fimDeSemana: z.literal(1).optional().catch(undefined),
});
type Busca = z.infer<typeof buscaSchema>;

const ATIVOS = { query: { ativo: true, porPagina: 100 } };

/** Ausências por página no modo Ausências da semana. */
const AUSENCIAS_POR_PAGINA = 20;

/** A consulta das ocorrências do modo; sem médico no Por médico, nada a buscar. */
function consulta(busca: Busca, hoje: string) {
  const modo: ModoEscala = busca.modo ?? 'semana';
  if (modo === 'ausencias') return null;
  if (modo === 'medico' && !busca.medicoId) return null;
  return {
    query: {
      ...janelaDoModo(modo, busca.data ?? hoje),
      ...(modo === 'medico' && { medicoId: busca.medicoId }),
      ...(busca.frenteIds && { frenteIds: busca.frenteIds }),
      ...(busca.turnoIds && { turnoIds: busca.turnoIds }),
    },
  };
}

/**
 * As ausências aprovadas da semana: a página da lista no modo Ausências; na semana, até 100 delas,
 * para o cartão do plantão dizer o período da ausência. Nos outros modos, nada.
 */
function consultaAusencias(busca: Busca, hoje: string) {
  const modo: ModoEscala = busca.modo ?? 'semana';
  const semana = { ...janelaDoModo(modo, busca.data ?? hoje), situacao: 'aprovada' as const };
  if (modo === 'ausencias') {
    return {
      query: {
        ...semana,
        busca: busca.busca,
        pagina: busca.pagina ?? 1,
        porPagina: AUSENCIAS_POR_PAGINA,
      },
    };
  }
  if (modo === 'semana') return { query: { ...semana, porPagina: 100 } };
  return null;
}

export const Route = createFileRoute('/_app/escala/')({
  validateSearch: buscaSchema,
  // A busca por nome e o agrupamento só mudam a tela, não a consulta.
  loaderDeps: ({ search: { busca: _busca, agrupar: _agrupar, ...resto } }) => resto,
  loader: async ({ context, deps, cause }) => {
    if (!pode(context.sessao, 'escala.ver')) return;
    const { queryClient } = context;
    const ocorrencias = consulta(deps, hojeEmBrasilia());
    // Na própria tela (outra semana, outro filtro), a tela busca sozinha e mostra os dados de antes
    // enquanto isso. Esperar aqui seguraria a tela no estado velho até a API responder, e um segundo
    // clique (outra frente no filtro, ▶ de novo) partiria dele e desfaria o primeiro.
    const esperarOcorrencias = Boolean(ocorrencias) && cause !== 'stay';
    const ausencias = deps.modo === 'ausencias' && consultaAusencias(deps, hojeEmBrasilia());
    await Promise.all([
      queryClient.ensureQueryData(turnosControllerListarQueryOptions(ATIVOS)),
      queryClient.ensureQueryData(frentesControllerListarQueryOptions(ATIVOS)),
      queryClient.ensureQueryData(escopoApiControllerMeuQueryOptions()),
      esperarOcorrencias &&
        ocorrencias &&
        queryClient.ensureQueryData(ocorrenciasControllerListarQueryOptions(ocorrencias)),
      ausencias &&
        cause !== 'stay' &&
        queryClient.ensureQueryData(ausenciasControllerListarQueryOptions(ausencias)),
    ]);
  },
  head: () => ({ meta: [{ title: 'Escala | One' }] }),
  component: Pagina,
});

function Pagina() {
  const { sessao } = Route.useRouteContext();
  return pode(sessao, 'escala.ver') ? <Escala /> : <SemPermissao tela="Escala" />;
}

function Escala() {
  const { sessao } = Route.useRouteContext();
  const busca = Route.useSearch();
  const navigate = Route.useNavigate();
  const [hoje] = useState(() => hojeEmBrasilia());
  const [painel, setPainel] = useState<PainelAberto | null>(null);
  const [avisos, setAvisos] = useState<AvisoConflitoDto[]>([]);
  const permissoes = podeNaTela(sessao, 'escala');

  const { data: paginaTurnos } = useSuspenseQuery(turnosControllerListarQueryOptions(ATIVOS));
  const { data: paginaFrentes } = useSuspenseQuery(frentesControllerListarQueryOptions(ATIVOS));
  const { data: meu } = useSuspenseQuery(escopoApiControllerMeuQueryOptions());
  const { turnos, frentes } = useMemo(
    () => aplicarRecorte(paginaTurnos.itens, paginaFrentes.itens, meu.escopo),
    [paginaTurnos, paginaFrentes, meu],
  );

  const opcoes = consulta(busca, hoje);
  const ocorrencias = useQuery({
    ...ocorrenciasControllerListarQueryOptions(opcoes ?? { query: { de: hoje, ate: hoje } }),
    enabled: Boolean(opcoes),
    placeholderData: keepPreviousData,
  });

  // O nome do médico do Por médico: dos plantões carregados ou, sem nenhum, do cadastro da escala.
  const nomeNosPlantoes = ocorrencias.data?.ocorrencias.find(
    (o) => o.medicoId === busca.medicoId,
  )?.medicoNome;
  const cadastro = useQuery({
    ...medicosEscalaControllerObterQueryOptions({ path: { id: busca.medicoId ?? '' } }),
    enabled: Boolean(busca.medicoId && !nomeNosPlantoes),
  });
  const nomeMedico = nomeNosPlantoes ?? cadastro.data?.nome;

  const opcoesAusencias = consultaAusencias(busca, hoje);
  const ausencias = useQuery({
    ...ausenciasControllerListarQueryOptions(opcoesAusencias ?? undefined),
    enabled: Boolean(opcoesAusencias),
    placeholderData: keepPreviousData,
  });

  // Os nomes de prioridades e subespecialidades (para o cartão do plantão), inativas inclusive:
  // vêm da escala, com `escala.ver`, sem depender de `catalogo.ver`.
  const classificacoes = useQuery(classificacoesEscalaControllerListarQueryOptions());
  const catalogo: NomesDoCatalogo = useMemo(
    () => ({
      prioridades: new Map((classificacoes.data?.prioridades ?? []).map((p) => [p.id, p.nome])),
      subespecialidades: new Map(
        (classificacoes.data?.subespecialidades ?? []).map((s) => [s.id, s.nome]),
      ),
    }),
    [classificacoes.data],
  );
  const modoAusencias = busca.modo === 'ausencias';

  const filtros: FiltrosEscala = {
    ...busca,
    modo: busca.modo ?? 'semana',
    agrupar: busca.agrupar ?? 'frente',
    data: busca.data ?? hoje,
  };

  const mudar = useCallback(
    (novos: Partial<FiltrosEscala>) =>
      void navigate({
        search: (atual) => {
          // Outra semana, modo ou busca volta à primeira página das ausências.
          const proxima = { ...atual, pagina: undefined, ...novos };
          // O padrão não vai para a URL.
          if (proxima.modo === 'semana') proxima.modo = undefined;
          if (proxima.agrupar === 'frente') proxima.agrupar = undefined;
          return proxima;
        },
        replace: true,
      }),
    [navigate],
  );

  // Depois de salvar, o plantão aberto mostra os dados novos (ajuste do dia, cobertura).
  const painelAtual: PainelAberto | null =
    painel?.tipo === 'plantao'
      ? {
          tipo: 'plantao',
          ocorrencia:
            ocorrencias.data?.ocorrencias.find(
              (o) =>
                o.alocacaoId === painel.ocorrencia.alocacaoId && o.data === painel.ocorrencia.data,
            ) ?? painel.ocorrencia,
        }
      : painel;

  return (
    <>
      <TelaEscala
        filtros={filtros}
        hoje={hoje}
        dados={opcoes ? ocorrencias.data : undefined}
        atualizando={modoAusencias ? ausencias.isPlaceholderData : ocorrencias.isPlaceholderData}
        erro={ocorrencias.isError}
        ausencias={opcoesAusencias ? ausencias.data : undefined}
        erroAusencias={ausencias.isError}
        catalogo={catalogo}
        onTentarDeNovo={() => void (modoAusencias ? ausencias.refetch() : ocorrencias.refetch())}
        turnos={turnos}
        frentes={frentes}
        medico={busca.medicoId && nomeMedico ? { valor: busca.medicoId, rotulo: nomeMedico } : null}
        buscarMedicos={buscarMedicosDaEscala}
        permissoes={permissoes}
        podeVerHistorico={pode(sessao, 'escala-historico.ver')}
        avisos={avisos}
        onDispensarAvisos={() => setAvisos([])}
        onMudar={mudar}
        onAbrirPlantao={(ocorrencia) => setPainel({ tipo: 'plantao', ocorrencia })}
        onAlocar={(lugar) => setPainel({ tipo: 'alocar', inicial: lugar })}
        onMontarEscala={() =>
          busca.medicoId &&
          nomeMedico &&
          setPainel({ tipo: 'escala-fixa', medico: { valor: busca.medicoId, rotulo: nomeMedico } })
        }
      />
      {painelAtual && (
        <PaineisEscala
          painel={painelAtual}
          hoje={hoje}
          turnos={turnos}
          frentes={frentes}
          conflitos={ocorrencias.data?.conflitos ?? []}
          permissoes={permissoes}
          podeDefinirAusencia={pode(sessao, 'ausencias.criar')}
          onAbrir={setPainel}
          onAvisos={setAvisos}
        />
      )}
    </>
  );
}
