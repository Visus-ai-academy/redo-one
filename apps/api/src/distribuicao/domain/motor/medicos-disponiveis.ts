import type { Arranjo, FrenteEscala } from '../arranjo';
import { capacidadeNoInstante, juntarPeriodos, type UnidadeTeto } from './capacidade';
import {
  type ConfiguracaoDistribuicao,
  dataEmBrasilia,
  horarioSemRoboVigente,
  minutosEmBrasilia,
  naFaixa,
  type RegrasPorFrente,
} from './configuracao';
import {
  type AlvoExame,
  casaArranjo,
  citaCliente,
  type DirecaoEquipe,
  direcionadoPara,
  escalaMarcaSegmento,
  type PeriodoEscala,
  porQuePeriodoRecusa,
  type ReservaMedico,
  reservadoPara,
  segmentoUnico,
} from './elegibilidade';
import { guardaParaPosteriores, listaDepoisDosFixos } from './lista';
import type { GradeRecebimento } from './prioridades-operacao';

/**
 * Quem está na rodada e o que cada um pode pegar, a partir da escala do momento. Fonte:
 * dashboards-one `medicosDisponiveis.ts` `montarMedicosDisponiveis`, sem banco: o cadastro, a
 * carga em mãos, a escala e os ajustes do dia entram prontos. Fora desta etapa: exceção do
 * médico, listas de médicos por cliente/exame, recorte de frentes da rodada, Lista do fim de
 * semana antecipada, margem do recolhimento e "exclusivos fora do turno" do cron.
 */

/** Uma ocorrência da escala (ver `escala/domain/ocorrencias.ts`), no que o motor lê. */
export interface OcorrenciaRodada {
  alocacaoId: string;
  medicoId: string;
  turnoId: string;
  turnoTipo: 'fixo' | 'lista';
  frente: FrenteEscala;
  /** Instantes (Brasília); o plantão que vira a meia-noite termina no dia seguinte. */
  inicio: Date;
  fim: Date;
  /** A do dia (com o ajuste de produtividade); null = desconhecida. */
  produtividade: number | null;
  gratificado: boolean;
  prioridadeIds: readonly string[];
  subespecialidadeIds: readonly string[];
  subespecialidadeGeral: boolean;
  coberturaDeId: string | null;
  ausente: boolean;
}

export interface MedicoRodada {
  id: string;
  nome: string;
  /** Os arranjos do próprio médico (os da equipe vêm em `equipes`). */
  arranjos: readonly Arranjo[];
  /** Em que o teto dele é contado; a carga em mãos já vem nessa unidade. */
  unidadeTeto: UnidadeTeto;
  /** Carga em mãos (atribuído e não laudado), na unidade do teto dele, inclusive a exclusiva. */
  cargaEmMaos: number;
  /** Dessa carga, a do recorte de clínica exclusiva (fica fora do teto). */
  cargaReservadaEmMaos: number;
  /**
   * Sem conta na MobileMed (`medicos.id_mobilemed` nulo): não há como atribuir a ele, então fica
   * barrado em todo exame (portão `sem_conta_mobilemed`), mesmo em turno.
   */
  semContaMobilemed?: boolean;
}

/**
 * Ajuste do dia do médico vindo da escala (no dashboards-one, a "exceção do robô"/reforço): laudos
 * acima do teto, prioridades liberadas e "segue o SLA neste dia" (o prazo mínimo das células da
 * grade de recebimento não vale para ele), num recorte opcional.
 */
export interface AjusteDia {
  medicoId: string;
  laudosExtra: number;
  prioridadeIdsLiberadas: readonly string[];
  segueSla: boolean;
  /** Null em cada eixo = todos. */
  recorte: {
    clienteId: string | null;
    especialidadeId: string | null;
    modalidadeId: string | null;
    subespecialidadeId: string | null;
  };
  inicio: Date;
  fim: Date;
}

/** Exame da fila diante da elegibilidade. */
export interface ExameElegivel extends AlvoExame {
  id: string;
  /**
   * Entregas anteriores do robô (executadas) e tiradas na conferência: o exame nunca volta a quem
   * já o recebeu ou de quem a operação o tirou nos últimos `diasJaEntregue` dias.
   */
  entregues: readonly EntregaAnterior[];
  /**
   * Médicos cuja conta principal não está liberada na unidade do exame na MobileMed (a lista da
   * unidade lida pela rodada): não recebem este exame. Ausente = sem conferência.
   */
  naoLiberados?: ReadonlySet<string>;
}

export interface EntregaAnterior {
  medicoId: string;
  em: Date;
  /**
   * `execucao` (padrão): o robô entregou e o exame voltou à fila; `conferencia`: tirado antes;
   * `recolhimento`: recolhido dele ao fim do turno ou pela ausência.
   */
  origem?: 'execucao' | 'conferencia' | 'recolhimento';
}

/** Onde um médico em turno parou diante de um exame (o "por que este médico não pegou"). */
export type Barreira =
  | 'sem_conta_mobilemed'
  | 'escala'
  | 'arranjo'
  | 'equipe'
  | 'reservado'
  | 'fora_da_unidade'
  | 'ja_entregue'
  | 'retirado_na_conferencia'
  | 'recolhido';

export interface ExplicacaoExame {
  /** Médicos que passaram por todos os portões (o motor escolhe entre eles). */
  elegiveis: string[];
  /** Médico em turno → o portão onde parou. Quem não está aqui nem é elegível não estava em turno. */
  barrados: Record<string, Barreira>;
}

export interface EntradaMedicos {
  agora: Date;
  exames: readonly ExameElegivel[];
  medicos: readonly MedicoRodada[];
  ocorrencias: readonly OcorrenciaRodada[];
  equipes: readonly DirecaoEquipe[];
  ajustes: readonly AjusteDia[];
  regras: RegrasPorFrente;
  config: ConfiguracaoDistribuicao;
  /** Grade de recebimento prioridade da operação × turno (com as sobrescritas das frentes). */
  grade: GradeRecebimento;
  /** Prioridades da operação que marcam urgência na alocação (ver `ContextoPeriodo`). */
  prioridadeIdsQueFuramGrade: readonly string[];
  /** Alocação gratificada → o que já foi executado por ela (abate a cota). */
  cotaEntregue: Readonly<Record<string, number>>;
  /** Turnos que a rodada atende; vazio ou ausente = todos. */
  filtroTurnoIds?: readonly string[];
  /**
   * Frentes que a rodada atende; vazio ou ausente = todas. O período de frente de modalidade fica
   * quando a rodada marca alguma especialidade (o RX de MI vai a quem está no RX).
   */
  filtroFrentes?: readonly FrenteEscala[];
  /** Entram mesmo fora dos turnos e das frentes do filtro. */
  medicosIncluidos?: readonly string[];
}

/** O médico como o motor o lê. */
export interface MedicoDisponivel {
  id: string;
  nome: string;
  elegivelPara: (exameId: string) => boolean;
  /** Teto da escala comum; null = desconhecido (sem teto). */
  capacidade: number | null;
  /** Produtividade cheia da escala, para a faixa reduzida do teto do segmento. */
  produtividade: number | null;
  /** Carga que ocupa o teto (em mãos, sem a exclusiva). */
  cargaInicial: number;
  /** O que falta da cota gratificada: piso, vem antes de todos e não barra no teto. */
  cotaGratificada: number;
  gratificadoPara: (exameId: string) => boolean;
  /** O exame é exclusivo dele: fora do teto, das misturas e do teto do segmento. */
  reservadoPara: (exameId: string) => boolean;
  /** Carga em mãos do recorte exclusivo: só divide o recorte entre dois exclusivos. */
  cargaReservada: number;
  /** Só tem um segmento a laudar: o teto desse segmento não vale para ele. */
  segmentoUnico: string | null;
  /** Laudos acima do teto que o ajuste do dia dá a ele para este exame. */
  extraPara: (exameId: string) => number;
  /** Em que o teto, a carga e a cota dele são contados. */
  unidadeTeto: UnidadeTeto;
}

/** Onde a elegibilidade de um exame zerou (o primeiro portão sem nenhum médico). */
export type EtapaElegibilidade =
  | 'plantao'
  | 'conta'
  | 'escala'
  | 'arranjo'
  | 'equipe'
  | 'reservado'
  | 'unidade'
  | 'retirado';

/**
 * Por que um médico da escala ficou fora da rodada (ou entrou sem poder receber): `ausente`
 * (ausência no dia), `turno_nao_marcado` / `frente_nao_marcada` (recorte da rodada),
 * `turno_encerrado`, `turno_a_comecar` (fora da antecedência) e `sem_conta_mobilemed`.
 */
export type MotivoForaDaRodada =
  | 'ausente'
  | 'turno_nao_marcado'
  | 'frente_nao_marcada'
  | 'turno_encerrado'
  | 'turno_a_comecar'
  | 'sem_conta_mobilemed';

export interface ForaDaRodada {
  motivo: MotivoForaDaRodada;
  /** O turno da ocorrência que melhor explica a saída. */
  turnoId: string;
  frente: FrenteEscala;
  inicio: Date;
}

export interface MedicosMontados {
  medicos: MedicoDisponivel[];
  /**
   * Médico da escala (habilitado) que não entrou na rodada → o motivo, pela ocorrência que melhor
   * o explica. Quem entrou por alguma ocorrência não aparece, salvo sem conta na MobileMed.
   */
  foraDaRodada: Record<string, ForaDaRodada>;
  etapaElegibilidade: Map<string, EtapaElegibilidade>;
  /** Exames que a Lista levaria sem o corte dos turnos posteriores. */
  guardadosParaPosteriores: Set<string>;
  /** Por exame: quem foi elegível e onde cada outro médico em turno parou. */
  explicacao: (exameId: string) => ExplicacaoExame;
  /** Alocação gratificada cuja cota o exame abate, se sair para o médico pela cota. */
  gratificadoPara: (medicoId: string, exameId: string) => string | null;
  /** Titular cuja escala é a única que aceita o exame no médico (ele está cobrindo). */
  coberturaPara: (medicoId: string, exameId: string) => string | null;
  funil: {
    medicos: {
      escalados: number;
      disponiveis: number;
      noTurno: number;
      noHorario: number;
      /** Dos no horário, os com conta na MobileMed (os outros não recebem). */
      comConta: number;
    };
    exames: {
      total: number;
      escala: number;
      arranjo: number;
      equipe: number;
      reservado: number;
      elegiveis: number;
    };
  };
}

interface Periodo extends PeriodoEscala {
  fixo: boolean;
  inicio: Date;
}

interface Escalado {
  periodos: Periodo[];
  valores: {
    coberturaDe: string | null;
    turnoId: string;
    alocacaoId: string;
    produtividade: number | null;
    capacidade: number | null;
  }[];
  comum: boolean;
}

/**
 * Qual ocorrência explica melhor por que o médico ficou de fora (a mais alta vence): a que entraria
 * se marcada, a ausência no turno em curso, o turno de hoje ainda longe, o turno encerrado, a
 * ausência em outro turno e, por último, o turno de outro dia.
 */
function pesoFora(o: OcorrenciaRodada, motivo: MotivoForaDaRodada, agora: Date): number {
  switch (motivo) {
    case 'sem_conta_mobilemed':
      return 6;
    case 'turno_nao_marcado':
    case 'frente_nao_marcada':
      return 5;
    case 'ausente':
      return o.inicio <= agora && agora < o.fim ? 4 : 1;
    case 'turno_a_comecar':
      return dataEmBrasilia(o.inicio) === dataEmBrasilia(agora) ? 3 : 0;
    case 'turno_encerrado':
      return 2;
  }
}

const chaveFrente = (f: FrenteEscala) => f.especialidadeId ?? f.modalidadeId;
const par = (medicoId: string, exameId: string) => `${medicoId}|${exameId}`;

function ajusteCobre(a: AjusteDia, e: AlvoExame, agora: Date): boolean {
  if (agora < a.inicio || agora >= a.fim) return false;
  const r = a.recorte;
  if (r.clienteId !== null && !citaCliente([r.clienteId], e)) return false;
  if (r.modalidadeId !== null && r.modalidadeId !== e.modalidadeId) return false;
  if (r.subespecialidadeId !== null && r.subespecialidadeId !== e.subespecialidadeId) return false;
  if (
    r.especialidadeId !== null &&
    r.especialidadeId !== e.especialidadeId &&
    !e.especialidadesDoSegmento.includes(r.especialidadeId)
  ) {
    return false;
  }
  return true;
}

export function montarMedicosDisponiveis(entrada: EntradaMedicos): MedicosMontados {
  const { agora, config, regras } = entrada;
  const filtroTurnos = entrada.filtroTurnoIds ?? [];
  const filtroFrentes = entrada.filtroFrentes ?? [];
  const incluidos = new Set(entrada.medicosIncluidos ?? []);
  const frentesDoFiltro = new Set(filtroFrentes.map(chaveFrente));
  const filtroTemEspecialidade = filtroFrentes.some((f) => f.tipo === 'especialidade');
  const naFrenteDoFiltro = (o: OcorrenciaRodada) =>
    !filtroFrentes.length ||
    frentesDoFiltro.has(chaveFrente(o.frente)) ||
    (o.frente.tipo === 'modalidade' && filtroTemEspecialidade);
  const medicosPorId = new Map(entrada.medicos.map((m) => [m.id, m]));
  const vigentes = entrada.ocorrencias.filter((o) => !o.ausente && medicosPorId.has(o.medicoId));

  // --- quem está na rodada ---
  const funilMedicos = {
    escalados: new Set<string>(),
    disponiveis: new Set<string>(),
    noTurno: new Set<string>(),
    noHorario: new Set<string>(),
  };
  // Só o turno marcado que está na rodada agora (não o de amanhã, que a escala traz junto).
  const noTurnoMarcado = new Set(
    vigentes
      .filter(
        (o) =>
          filtroTurnos.includes(o.turnoId) &&
          capacidadeNoInstante(o, agora, {
            antecedenciaMin: config.antecedenciaPeriodoMin,
            turnoEscolhido: true,
          }).entra,
      )
      .map((o) => o.medicoId),
  );
  const naEscala = new Map<string, Escalado>();
  const cotas = new Map<string, { medicoId: string; restante: number }>();
  let posterioresNaRodada = false;
  const posteriores = new Set(config.turnosPosteriores?.turnoIds ?? []);
  // A ocorrência que melhor explica a saída decide o motivo (ver `pesoFora`).
  const candidatos = new Map<string, ForaDaRodada & { peso: number }>();
  const fora = (o: OcorrenciaRodada, motivo: MotivoForaDaRodada) => {
    const peso = pesoFora(o, motivo, agora);
    const atual = candidatos.get(o.medicoId);
    if (atual && atual.peso >= peso) return;
    candidatos.set(o.medicoId, {
      motivo,
      turnoId: o.turnoId,
      frente: o.frente,
      inicio: o.inicio,
      peso,
    });
  };

  for (const o of entrada.ocorrencias) {
    if (!medicosPorId.has(o.medicoId)) continue;
    funilMedicos.escalados.add(o.medicoId);
    if (o.ausente) {
      fora(o, 'ausente');
      continue;
    }
    funilMedicos.disponiveis.add(o.medicoId);
    // A Lista de quem está num turno marcado entra junto e soma (30/10, Jainy).
    const foraDoFiltro =
      !incluidos.has(o.medicoId) &&
      ((filtroTurnos.length > 0 &&
        !filtroTurnos.includes(o.turnoId) &&
        !(o.turnoTipo === 'lista' && noTurnoMarcado.has(o.medicoId))) ||
        !naFrenteDoFiltro(o));
    if (foraDoFiltro) {
      // Nem marcado entraria (encerrado, ou de outro dia além da antecedência): o motivo é o horário.
      const marcado = capacidadeNoInstante(o, agora, {
        antecedenciaMin: config.antecedenciaPeriodoMin,
        turnoEscolhido: true,
      });
      fora(
        o,
        !marcado.entra
          ? agora >= o.fim
            ? 'turno_encerrado'
            : 'turno_a_comecar'
          : naFrenteDoFiltro(o)
            ? 'turno_nao_marcado'
            : 'frente_nao_marcada',
      );
      continue;
    }
    funilMedicos.noTurno.add(o.medicoId);
    const cap = capacidadeNoInstante(o, agora, {
      antecedenciaMin: config.antecedenciaPeriodoMin,
      turnoEscolhido:
        filtroTurnos.length > 0 || filtroFrentes.length > 0 || incluidos.has(o.medicoId),
    });
    if (!cap.entra) {
      fora(o, agora >= o.fim ? 'turno_encerrado' : 'turno_a_comecar');
      continue;
    }
    funilMedicos.noHorario.add(o.medicoId);
    if (posteriores.has(o.turnoId)) posterioresNaRodada = true;

    const atual = naEscala.get(o.medicoId) ?? { periodos: [], valores: [], comum: false };
    atual.periodos.push({
      alocacaoId: o.alocacaoId,
      turnoId: o.turnoId,
      lista: o.turnoTipo === 'lista' && !o.gratificado,
      gratificado: o.gratificado,
      frente: o.frente,
      todasPrioridades: o.prioridadeIds.length === 0,
      prioridadeIds: o.prioridadeIds,
      todosSegmentos: !o.subespecialidadeIds.length && !o.subespecialidadeGeral,
      subespecialidadeIds: o.subespecialidadeIds,
      subespecialidadeGeral: o.subespecialidadeGeral,
      coberturaDeId: o.coberturaDeId,
      fixo: o.turnoTipo === 'fixo',
      inicio: o.inicio,
    });
    naEscala.set(o.medicoId, atual);
    if (o.gratificado) {
      const feito = entrada.cotaEntregue[o.alocacaoId] ?? 0;
      cotas.set(o.alocacaoId, {
        medicoId: o.medicoId,
        restante: Math.max(0, (o.produtividade ?? 0) - feito),
      });
      continue;
    }
    atual.comum = true;
    atual.valores.push({
      coberturaDe: o.coberturaDeId,
      turnoId: o.turnoId,
      alocacaoId: o.alocacaoId,
      produtividade: o.produtividade,
      capacidade: cap.capacidade,
    });
  }

  // --- a Lista diante dos turnos posteriores ---
  const emMaos = (medicoId: string) => medicosPorId.get(medicoId)?.cargaEmMaos ?? 0;
  const vagaDe = (o: OcorrenciaRodada) =>
    o.produtividade === null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, o.produtividade - emMaos(o.medicoId));
  const ocPosteriores = vigentes.filter((o) => posteriores.has(o.turnoId));
  const listasComuns = vigentes.filter((o) => o.turnoTipo === 'lista' && !o.gratificado);
  const listaDaConta = (o: OcorrenciaRodada) => ({
    alocacaoId: o.alocacaoId,
    frente: chaveFrente(o.frente) as string,
    produtividade: o.produtividade ?? 0,
  });
  const comSegueSla = new Set(
    entrada.ajustes
      .filter((a) => a.segueSla && agora >= a.inicio && agora < a.fim)
      .map((a) => a.medicoId),
  );
  const guarda =
    config.turnosPosteriores && comSegueSla.size
      ? guardaParaPosteriores({
          agora,
          cheiaEm: config.turnosPosteriores.cheiaEm,
          posterioresNaRodada,
          posteriores: ocPosteriores.map((o) => ({
            frente: chaveFrente(o.frente) as string,
            fim: o.fim,
            vaga: vagaDe(o),
          })),
          listas: listasComuns.filter((o) => comSegueSla.has(o.medicoId)).map(listaDaConta),
          fila: entrada.exames,
        })
      : { corte: new Map<string, number>(), reserva: new Map<string, number>() };
  const tetoLista = listaDepoisDosFixos({
    agora,
    posterioresNaRodada,
    frentes: new Set(
      regras.todas.filter((r) => r.listaDepoisDosFixos).map((r) => chaveFrente(r.frente) as string),
    ),
    posteriores: ocPosteriores.map((o) => ({
      frente: chaveFrente(o.frente) as string,
      inicio: o.inicio,
      vaga: vagaDe(o),
    })),
    listas: listasComuns.map(listaDaConta),
    fila: entrada.exames,
  });

  // --- elegibilidade, exame a exame ---
  const reservas: ReservaMedico[] = entrada.medicos.flatMap((m) =>
    m.arranjos
      .filter((a) => a.clientesExclusivosIds.length)
      .map((arranjo) => ({ medicoId: m.id, arranjo })),
  );
  const limiteEntregue = agora.getTime() - config.diasJaEntregue * 86_400_000;
  const elegiveis = new Map<string, Set<string>>();
  const pelaReserva = new Set<string>();
  const gratificados = new Map<string, string>();
  const coberturas = new Map<string, string>();
  const extras = new Map<string, number>();
  const etapaElegibilidade = new Map<string, EtapaElegibilidade>();
  const guardadosParaPosteriores = new Set<string>();
  const barradosPorExame = new Map<string, Record<string, Barreira>>();
  const funilExames = {
    total: entrada.exames.length,
    escala: 0,
    arranjo: 0,
    equipe: 0,
    reservado: 0,
    elegiveis: 0,
  };

  for (const e of entrada.exames) {
    const fechados = [
      regras.daEspecialidade(e.especialidadeId),
      regras.daModalidade(e.modalidadeId),
    ]
      .flatMap((r) => r?.horariosSemRobo ?? [])
      .filter((h) => horarioSemRoboVigente(h, agora));
    const janelaFecha = (p: Periodo) =>
      p.fixo && fechados.some((h) => naFaixa(h, minutosEmBrasilia(p.inicio)));
    const reservaram = reservas.length ? reservadoPara(reservas, e) : new Set<string>();
    const daEquipe = direcionadoPara(entrada.equipes, e);
    const doExame = new Set<string>();
    const alcancou = {
      conta: false,
      escala: false,
      arranjo: false,
      equipe: false,
      reservado: false,
      unidade: false,
    };
    const barrados: Record<string, Barreira> = {};
    barradosPorExame.set(e.id, barrados);

    for (const [medicoId, escalado] of naEscala) {
      const medico = medicosPorId.get(medicoId) as MedicoRodada;
      if (medico.semContaMobilemed) {
        barrados[medicoId] = 'sem_conta_mobilemed';
        continue;
      }
      alcancou.conta = true;
      const ajustes = entrada.ajustes.filter(
        (a) => a.medicoId === medicoId && ajusteCobre(a, e, agora),
      );
      const prioridadesLiberadas = new Set(ajustes.flatMap((a) => a.prioridadeIdsLiberadas));
      const ctx = {
        escalaRestringeEspecialidade: config.escalaRestringeEspecialidade,
        grade: entrada.grade,
        prioridadeIdsQueFuramGrade: entrada.prioridadeIdsQueFuramGrade,
        prioridadesLiberadas,
        segueSlaNoDia: ajustes.some((a) => a.segueSla),
      };
      const aceitos = escalado.periodos.filter(
        (p) =>
          !janelaFecha(p) &&
          porQuePeriodoRecusa(p, e, { ...ctx, cortePosteriores: guarda.corte }) === null,
      );
      if (!aceitos.length) {
        // Sem o corte ele levaria: o motivo é "guardado para os posteriores", não "ninguém".
        if (
          guarda.corte.size &&
          escalado.periodos.some((p) => !janelaFecha(p) && porQuePeriodoRecusa(p, e, ctx) === null)
        ) {
          guardadosParaPosteriores.add(e.id);
        }
        barrados[medicoId] = 'escala';
        continue;
      }
      alcancou.escala = true;
      const segmentoDaEscala = escalaMarcaSegmento(aceitos, e.subespecialidadeId);
      if (
        !medico.arranjos.some((a) => casaArranjo(a, e, { prioridadesLiberadas, segmentoDaEscala }))
      ) {
        barrados[medicoId] = 'arranjo';
        continue;
      }
      alcancou.arranjo = true;
      if (daEquipe && !daEquipe.medicos.has(medicoId)) {
        barrados[medicoId] = 'equipe';
        continue;
      }
      alcancou.equipe = true;
      if (reservaram.size && !reservaram.has(medicoId)) {
        barrados[medicoId] = 'reservado';
        continue;
      }
      alcancou.reservado = true;
      if (e.naoLiberados?.has(medicoId)) {
        barrados[medicoId] = 'fora_da_unidade';
        continue;
      }
      alcancou.unidade = true;
      const entregas = e.entregues.filter(
        (x) => x.medicoId === medicoId && x.em.getTime() >= limiteEntregue,
      );
      if (entregas.length) {
        barrados[medicoId] = entregas.some((x) => x.origem === 'conferencia')
          ? 'retirado_na_conferencia'
          : entregas.some((x) => x.origem === 'recolhimento')
            ? 'recolhido'
            : 'ja_entregue';
        continue;
      }

      doExame.add(medicoId);
      const k = par(medicoId, e.id);
      if (reservaram.has(medicoId)) pelaReserva.add(k);
      const grat = aceitos.find(
        (p) => p.gratificado && (cotas.get(p.alocacaoId)?.restante ?? 0) > 0,
      );
      if (grat) gratificados.set(k, grat.alocacaoId);
      const titulares = new Set(aceitos.map((p) => p.coberturaDeId));
      const [titular] = titulares;
      if (titulares.size === 1 && titular) coberturas.set(k, titular);
      const extra = Math.max(0, ...ajustes.map((a) => a.laudosExtra));
      if (extra > 0) extras.set(k, extra);
    }

    elegiveis.set(e.id, doExame);
    if (alcancou.escala) funilExames.escala++;
    if (alcancou.arranjo) funilExames.arranjo++;
    if (alcancou.equipe) funilExames.equipe++;
    if (alcancou.reservado) funilExames.reservado++;
    if (doExame.size) funilExames.elegiveis++;
    const zerou: EtapaElegibilidade | null = daEquipe?.plantao
      ? 'plantao'
      : !alcancou.conta && naEscala.size
        ? 'conta'
        : !alcancou.escala
          ? 'escala'
          : !alcancou.arranjo
            ? 'arranjo'
            : !alcancou.equipe
              ? 'equipe'
              : !alcancou.reservado
                ? 'reservado'
                : !alcancou.unidade
                  ? 'unidade'
                  : !doExame.size
                    ? 'retirado'
                    : null;
    if (zerou) etapaElegibilidade.set(e.id, zerou);
  }

  // --- o médico pronto para o motor ---
  const cotaDoMedico = new Map<string, number>();
  for (const { medicoId, restante } of cotas.values()) {
    cotaDoMedico.set(medicoId, (cotaDoMedico.get(medicoId) ?? 0) + restante);
  }
  const medicos: MedicoDisponivel[] = entrada.medicos
    .filter((m) => naEscala.has(m.id))
    .map((m) => {
      const escalado = naEscala.get(m.id) as Escalado;
      const produtividade = juntarPeriodos(
        escalado.valores.map((v) => ({
          coberturaDe: v.coberturaDe,
          turnoId: v.turnoId,
          valor: v.produtividade,
        })),
      );
      const capacidadeComum = juntarPeriodos(
        escalado.valores.map((v) => ({
          coberturaDe: v.coberturaDe,
          turnoId: v.turnoId,
          valor:
            v.capacidade === null
              ? null
              : Math.min(
                  tetoLista.get(v.alocacaoId) ?? Number.POSITIVE_INFINITY,
                  Math.max(0, v.capacidade - (guarda.reserva.get(v.alocacaoId) ?? 0)),
                ),
        })),
      );
      // Só gratificado: a capacidade comum é zero (null seria "sem teto"); tudo vem da cota.
      const capacidade = escalado.comum ? capacidadeComum : 0;
      const cargaReservada = Math.min(m.cargaEmMaos, m.cargaReservadaEmMaos);
      return {
        id: m.id,
        nome: m.nome,
        elegivelPara: (exameId: string) => elegiveis.get(exameId)?.has(m.id) ?? false,
        capacidade,
        produtividade,
        cargaInicial: m.cargaEmMaos - cargaReservada,
        cotaGratificada: cotaDoMedico.get(m.id) ?? 0,
        gratificadoPara: (exameId: string) => gratificados.has(par(m.id, exameId)),
        reservadoPara: (exameId: string) => pelaReserva.has(par(m.id, exameId)),
        cargaReservada,
        segmentoUnico: segmentoUnico(m.arranjos) ?? segmentoUnico(escalado.periodos),
        extraPara: (exameId: string) => extras.get(par(m.id, exameId)) ?? 0,
        unidadeTeto: m.unidadeTeto,
      };
    });

  const foraDaRodada: Record<string, ForaDaRodada> = {};
  for (const [medicoId, { peso: _, ...c }] of candidatos) {
    if (!naEscala.has(medicoId)) foraDaRodada[medicoId] = c;
  }
  for (const [medicoId, escalado] of naEscala) {
    const [p] = escalado.periodos;
    if (p && medicosPorId.get(medicoId)?.semContaMobilemed) {
      foraDaRodada[medicoId] = {
        motivo: 'sem_conta_mobilemed',
        turnoId: p.turnoId,
        frente: p.frente,
        inicio: p.inicio,
      };
    }
  }

  return {
    medicos,
    foraDaRodada,
    etapaElegibilidade,
    guardadosParaPosteriores,
    explicacao: (exameId) => ({
      elegiveis: [...(elegiveis.get(exameId) ?? [])],
      barrados: { ...(barradosPorExame.get(exameId) ?? {}) },
    }),
    gratificadoPara: (medicoId, exameId) => gratificados.get(par(medicoId, exameId)) ?? null,
    coberturaPara: (medicoId, exameId) => coberturas.get(par(medicoId, exameId)) ?? null,
    funil: {
      medicos: {
        escalados: funilMedicos.escalados.size,
        disponiveis: funilMedicos.disponiveis.size,
        noTurno: funilMedicos.noTurno.size,
        noHorario: funilMedicos.noHorario.size,
        comConta: [...funilMedicos.noHorario].filter(
          (id) => !medicosPorId.get(id)?.semContaMobilemed,
        ).length,
      },
      exames: funilExames,
    },
  };
}
