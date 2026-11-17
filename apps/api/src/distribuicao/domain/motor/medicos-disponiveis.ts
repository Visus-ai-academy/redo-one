import type { Arranjo, FrenteEscala } from '../arranjo';
import { capacidadeNoInstante, juntarPeriodos } from './capacidade';
import {
  type ConfiguracaoDistribuicao,
  horarioSemRoboVigente,
  minutosEmBrasilia,
  naFaixa,
  type RegrasPorFrente,
} from './configuracao';
import {
  type AlvoExame,
  arranjoMarcaPrioridade,
  casaArranjo,
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
  /** Carga em mãos (atribuído e não laudado), na unidade da carga, inclusive a exclusiva. */
  cargaEmMaos: number;
  /** Dessa carga, a do recorte de clínica exclusiva (fica fora do teto). */
  cargaReservadaEmMaos: number;
}

/**
 * Ajuste do dia do médico vindo da escala (no dashboards-one, a "exceção do robô"/reforço): laudos
 * acima do teto, prioridades liberadas e "a Lista segue o SLA", num recorte opcional.
 */
export interface AjusteDia {
  medicoId: string;
  laudosExtra: number;
  prioridadeIdsLiberadas: readonly string[];
  listaSegueSla: boolean;
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
  /** Entregas anteriores do robô (executadas); o exame de volta à fila foi tirado de quem o tinha. */
  entregues: readonly { medicoId: string; em: Date }[];
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
  /** Alocação gratificada → o que já foi executado por ela (abate a cota). */
  cotaEntregue: Readonly<Record<string, number>>;
  /** Turnos que a rodada atende; vazio ou ausente = todos. */
  filtroTurnoIds?: readonly string[];
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
}

/** Onde a elegibilidade de um exame zerou (o primeiro portão sem nenhum médico). */
export type EtapaElegibilidade =
  | 'plantao'
  | 'escala'
  | 'arranjo'
  | 'equipe'
  | 'reservado'
  | 'retirado';

export interface MedicosMontados {
  medicos: MedicoDisponivel[];
  etapaElegibilidade: Map<string, EtapaElegibilidade>;
  /** Exames que a Lista levaria sem o corte dos turnos posteriores. */
  guardadosParaPosteriores: Set<string>;
  /** Alocação gratificada cuja cota o exame abate, se sair para o médico pela cota. */
  gratificadoPara: (medicoId: string, exameId: string) => string | null;
  /** Titular cuja escala é a única que aceita o exame no médico (ele está cobrindo). */
  coberturaPara: (medicoId: string, exameId: string) => string | null;
  funil: {
    medicos: { escalados: number; disponiveis: number; noTurno: number; noHorario: number };
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

const chaveFrente = (f: FrenteEscala) => f.especialidadeId ?? f.modalidadeId;
const par = (medicoId: string, exameId: string) => `${medicoId}|${exameId}`;

function ajusteCobre(a: AjusteDia, e: AlvoExame, agora: Date): boolean {
  if (agora < a.inicio || agora >= a.fim) return false;
  const r = a.recorte;
  if (r.clienteId !== null && r.clienteId !== e.clienteId) return false;
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
  const medicosPorId = new Map(entrada.medicos.map((m) => [m.id, m]));
  const vigentes = entrada.ocorrencias.filter((o) => !o.ausente && medicosPorId.has(o.medicoId));

  // --- quem está na rodada ---
  const funilMedicos = {
    escalados: new Set<string>(),
    disponiveis: new Set<string>(),
    noTurno: new Set<string>(),
    noHorario: new Set<string>(),
  };
  const noTurnoMarcado = new Set(
    vigentes.filter((o) => filtroTurnos.includes(o.turnoId)).map((o) => o.medicoId),
  );
  const naEscala = new Map<string, Escalado>();
  const cotas = new Map<string, { medicoId: string; restante: number }>();
  let posterioresNaRodada = false;
  const posteriores = new Set(config.turnosPosteriores?.turnoIds ?? []);

  for (const o of entrada.ocorrencias) {
    if (!medicosPorId.has(o.medicoId)) continue;
    funilMedicos.escalados.add(o.medicoId);
    if (o.ausente) continue;
    funilMedicos.disponiveis.add(o.medicoId);
    // A Lista de quem está num turno marcado entra junto e soma (30/10, Jainy).
    const foraDoFiltro =
      filtroTurnos.length > 0 &&
      !filtroTurnos.includes(o.turnoId) &&
      !(o.turnoTipo === 'lista' && noTurnoMarcado.has(o.medicoId));
    if (foraDoFiltro) continue;
    funilMedicos.noTurno.add(o.medicoId);
    const cap = capacidadeNoInstante(o, agora, {
      antecedenciaMin: config.antecedenciaPeriodoMin,
      turnoEscolhido: filtroTurnos.length > 0,
    });
    if (!cap.entra) continue;
    funilMedicos.noHorario.add(o.medicoId);
    if (posteriores.has(o.turnoId)) posterioresNaRodada = true;

    const atual = naEscala.get(o.medicoId) ?? { periodos: [], valores: [], comum: false };
    atual.periodos.push({
      alocacaoId: o.alocacaoId,
      turnoId: o.turnoId,
      lista: o.turnoTipo === 'lista' && !o.gratificado,
      gratificado: o.gratificado,
      frente: o.frente,
      prioridadeIds: o.prioridadeIds,
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
  const comListaSegueSla = new Set(
    entrada.ajustes
      .filter((a) => a.listaSegueSla && agora >= a.inicio && agora < a.fim)
      .map((a) => a.medicoId),
  );
  const guarda =
    config.turnosPosteriores && comListaSegueSla.size
      ? guardaParaPosteriores({
          agora,
          cheiaEm: config.turnosPosteriores.cheiaEm,
          posterioresNaRodada,
          posteriores: ocPosteriores.map((o) => ({
            frente: chaveFrente(o.frente) as string,
            fim: o.fim,
            vaga: vagaDe(o),
          })),
          listas: listasComuns.filter((o) => comListaSegueSla.has(o.medicoId)).map(listaDaConta),
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
    const alcancou = { escala: false, arranjo: false, equipe: false, reservado: false };

    for (const [medicoId, escalado] of naEscala) {
      const medico = medicosPorId.get(medicoId) as MedicoRodada;
      const ajustes = entrada.ajustes.filter(
        (a) => a.medicoId === medicoId && ajusteCobre(a, e, agora),
      );
      const prioridadesLiberadas = new Set(ajustes.flatMap((a) => a.prioridadeIdsLiberadas));
      const listaSegueSla = ajustes.some((a) => a.listaSegueSla);
      const marca = arranjoMarcaPrioridade(medico.arranjos, e, { prioridadesLiberadas });
      const ctx = {
        escalaRestringeEspecialidade: config.escalaRestringeEspecialidade,
        regras,
        prioridadesLiberadas,
        listaSegueSla,
        arranjoMarcaPrioridade: marca,
        prioridadeIdsUrgentes: config.prioridadeIdsUrgentes,
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
        continue;
      }
      alcancou.escala = true;
      const segmentoDaEscala = escalaMarcaSegmento(aceitos, e.subespecialidadeId);
      if (
        !medico.arranjos.some((a) => casaArranjo(a, e, { prioridadesLiberadas, segmentoDaEscala }))
      )
        continue;
      alcancou.arranjo = true;
      if (daEquipe && !daEquipe.medicos.has(medicoId)) continue;
      alcancou.equipe = true;
      if (reservaram.size && !reservaram.has(medicoId)) continue;
      alcancou.reservado = true;
      if (e.entregues.some((x) => x.medicoId === medicoId && x.em.getTime() >= limiteEntregue))
        continue;

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
      : !alcancou.escala
        ? 'escala'
        : !alcancou.arranjo
          ? 'arranjo'
          : !alcancou.equipe
            ? 'equipe'
            : !alcancou.reservado
              ? 'reservado'
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
      };
    });

  return {
    medicos,
    etapaElegibilidade,
    guardadosParaPosteriores,
    gratificadoPara: (medicoId, exameId) => gratificados.get(par(medicoId, exameId)) ?? null,
    coberturaPara: (medicoId, exameId) => coberturas.get(par(medicoId, exameId)) ?? null,
    funil: {
      medicos: {
        escalados: funilMedicos.escalados.size,
        disponiveis: funilMedicos.disponiveis.size,
        noTurno: funilMedicos.noTurno.size,
        noHorario: funilMedicos.noHorario.size,
      },
      exames: funilExames,
    },
  };
}
