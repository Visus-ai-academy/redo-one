import type { Arranjo, FrenteEscala, ModoVinculo } from '../arranjo';
import type { GradeRecebimento } from './prioridades-operacao';

/**
 * Elegibilidade de um médico para um exame: o casamento do arranjo, o direcionamento das equipes,
 * a clínica exclusiva e o recorte de cada período da escala. Fonte: dashboards-one
 * `src/lib/services/distribuicao/arranjo.ts`. Diferenças de propósito: tudo por id (o legado
 * comparava nomes normalizados), a prioridade pela da operação (19/11/2026: o legado comparava a
 * grafia, então só recebe Internado quem marca Internado), o recebimento é a grade prioridade da
 * operação × turno (a Lista deixou de ser especial) e a urgência pela alocação vale em qualquer
 * turno.
 */

/** O exame como a elegibilidade o vê, já resolvido contra o catálogo. */
export interface AlvoExame {
  especialidadeId: string | null;
  /** Especialidades a que o segmento do exame pertence (COLUNAS é de NEURO e de MSK). */
  especialidadesDoSegmento: readonly string[];
  modalidadeId: string | null;
  subespecialidadeId: string | null;
  /**
   * Prioridade da operação (de-para próprio da distribuição): a dos recortes do arranjo, da
   * alocação e do ajuste do dia. Null = grafia sem de-para e sem padrão: só o recorte vazio a aceita.
   */
  prioridadeOperacaoId: string | null;
  /** A operação trata o exame como urgência. */
  urgente: boolean;
  exameId: string | null;
  clienteId: string | null;
  /** Minutos até o prazo; negativo = vencido; null = ilegível. */
  restanteMin: number | null;
}

/** O que a frente e o recorte de segmento de um período olham do exame. */
export type AlvoDaFrente = Pick<
  AlvoExame,
  'especialidadeId' | 'especialidadesDoSegmento' | 'modalidadeId' | 'subespecialidadeId'
>;

/** O exame é da especialidade: a dele ou uma alcançada pelo segmento. */
function daEspecialidade(especialidadeId: string, alvo: AlvoDaFrente): boolean {
  return (
    alvo.especialidadeId === especialidadeId ||
    alvo.especialidadesDoSegmento.includes(especialidadeId)
  );
}

function atende(modo: ModoVinculo, naLista: boolean): boolean {
  if (modo === 'todos') return true;
  return modo === 'apenas' ? naLista : !naLista;
}

/** Recorte de segmento: vazio sem o geral = todos; o exame sem segmento só passa com o geral. */
function casaSegmento(
  recorte: { subespecialidadeIds: readonly string[]; subespecialidadeGeral: boolean },
  subespecialidadeId: string | null,
): boolean {
  if (!recorte.subespecialidadeIds.length && !recorte.subespecialidadeGeral) return true;
  if (subespecialidadeId === null) return recorte.subespecialidadeGeral;
  return recorte.subespecialidadeIds.includes(subespecialidadeId);
}

/** O recorte de prioridade (da operação) aceita o exame? Vazio = todas. */
function casaPrioridade(
  prioridadeIds: readonly string[],
  a: Pick<AlvoExame, 'prioridadeOperacaoId'>,
  liberadas: ReadonlySet<string> | undefined,
): boolean {
  if (!prioridadeIds.length || a.prioridadeOperacaoId === null) return !prioridadeIds.length;
  return prioridadeIds.includes(a.prioridadeOperacaoId) || !!liberadas?.has(a.prioridadeOperacaoId);
}

export interface OpcoesCasamento {
  /** Prioridades da operação liberadas pelo ajuste do dia: furam só o eixo da prioridade. */
  prioridadesLiberadas?: ReadonlySet<string>;
  /** Algum período que aceitou o exame nomeia o segmento dele: fura só o eixo do segmento. */
  segmentoDaEscala?: boolean;
}

/**
 * O arranjo casa o exame por inteiro? Lista vazia é "todos"; valor desconhecido não casa lista
 * restrita, exceto cliente e exame (não se barra pelo que não se sabe).
 */
export function casaArranjo(a: Arranjo, alvo: AlvoExame, opcoes: OpcoesCasamento = {}): boolean {
  if (a.especialidadeId !== null && !daEspecialidade(a.especialidadeId, alvo)) return false;
  if (
    a.modalidadeIds.length &&
    (alvo.modalidadeId === null || !a.modalidadeIds.includes(alvo.modalidadeId))
  ) {
    return false;
  }
  if (!opcoes.segmentoDaEscala && !casaSegmento(a, alvo.subespecialidadeId)) return false;
  if (!casaPrioridade(a.prioridadeIds, alvo, opcoes.prioridadesLiberadas)) return false;
  if (alvo.exameId && !atende(a.modoExames, a.exameIds.includes(alvo.exameId))) return false;
  if (alvo.clienteId && !atende(a.modoClientes, a.clienteIds.includes(alvo.clienteId)))
    return false;
  return true;
}

/** Só se reserva ou direciona o que se sabe que é do recorte (cliente e exame conhecidos). */
function sabeQueEDoRecorte(a: Arranjo, alvo: AlvoExame): boolean {
  if (a.modoClientes !== 'todos' && !alvo.clienteId) return false;
  if (a.modoExames !== 'todos' && !alvo.exameId) return false;
  return casaArranjo(a, alvo);
}

/** Um arranjo de médico, para a clínica exclusiva. */
export interface ReservaMedico {
  medicoId: string;
  arranjo: Arranjo;
}

/**
 * Os médicos EXCLUSIVOS do exame: os que marcaram a clínica dele como exclusiva num arranjo que
 * cobre o exame. Vazio = o exame não é exclusivo de ninguém.
 */
export function reservadoPara(reservas: readonly ReservaMedico[], alvo: AlvoExame): Set<string> {
  const quem = new Set<string>();
  if (!alvo.clienteId) return quem;
  for (const r of reservas) {
    if (quem.has(r.medicoId) || !r.arranjo.clientesExclusivosIds.includes(alvo.clienteId)) continue;
    if (sabeQueEDoRecorte(r.arranjo, alvo)) quem.add(r.medicoId);
  }
  return quem;
}

/** Os arranjos de uma equipe: direcionam o recorte aos membros, não dão permissão a ninguém. */
export interface DirecaoEquipe {
  membros: readonly string[];
  arranjos: readonly Arranjo[];
  /** Equipe de plantão: o recorte é laudado à mão, o robô não o dá a ninguém. */
  plantao: boolean;
}

/**
 * A quem o exame está direcionado: os membros das equipes cujo arranjo o cobre. Null = não é de
 * equipe nenhuma. Se uma delas é de plantão, ninguém recebe pelo robô.
 */
export function direcionadoPara(
  equipes: readonly DirecaoEquipe[],
  alvo: AlvoExame,
): { medicos: Set<string>; plantao: boolean } | null {
  let quem: { medicos: Set<string>; plantao: boolean } | null = null;
  for (const e of equipes) {
    if (!e.arranjos.some((a) => sabeQueEDoRecorte(a, alvo))) continue;
    quem ??= { medicos: new Set(), plantao: false };
    if (e.plantao) quem.plantao = true;
    for (const id of e.membros) quem.medicos.add(id);
  }
  if (quem?.plantao) quem.medicos.clear();
  return quem;
}

/** Um período vigente do médico (uma ocorrência da escala), com o seu recorte. */
export interface PeriodoEscala {
  alocacaoId: string;
  turnoId: string;
  /** Turno do tipo Lista e não gratificado: guarda o curto para os turnos posteriores. */
  lista: boolean;
  /** Escala gratificada: segue o SLA puro (fora da grade de recebimento), com cota à parte. */
  gratificado: boolean;
  frente: FrenteEscala;
  /** Recortes da alocação (prioridades da operação e segmentos); vazio = sem recorte. */
  prioridadeIds: readonly string[];
  subespecialidadeIds: readonly string[];
  subespecialidadeGeral: boolean;
  /** Período de cobertura: o titular que ele cobre. */
  coberturaDeId: string | null;
}

export interface ContextoPeriodo {
  escalaRestringeEspecialidade: boolean;
  /** Grade de recebimento prioridade da operação × turno, com as sobrescritas das frentes. */
  grade: GradeRecebimento;
  /**
   * Prioridades da operação que, marcadas na alocação, a fazem receber as urgências: as tratadas
   * sempre como urgência (URGÊNCIA, INTERNADO).
   */
  prioridadeIdsUrgentes: readonly string[];
  /** Prioridades da operação liberadas pelo ajuste do dia do médico. */
  prioridadesLiberadas?: ReadonlySet<string>;
  /** Ajuste do dia "segue o SLA neste dia": o prazo mínimo das células não vale. */
  segueSlaNoDia?: boolean;
  /** Frente (id da especialidade ou modalidade) → minutos até o fim dos turnos posteriores. */
  cortePosteriores?: ReadonlyMap<string, number>;
}

const horas = (min: number) => Math.round(min / 60);

/**
 * "Se na escala do médico tem Lista e urgência, ele precisa receber as urgências" (17/11/2026):
 * a alocação que marca uma prioridade da operação sempre urgente recebe o que a operação trata
 * como urgência pelo SLA, mesmo que a célula diga "não recebe" ou prazo mínimo. Vale em qualquer
 * turno (18/11: a Lista deixou de ser especial). Alocação sem recorte não marca nada; o recorte
 * de prioridade da alocação continua valendo depois.
 */
function urgenciaPelaAlocacao(p: PeriodoEscala, a: AlvoExame, ctx: ContextoPeriodo): boolean {
  return a.urgente && p.prioridadeIds.some((id) => ctx.prioridadeIdsUrgentes.includes(id));
}

/** A frente do período alcança o exame? Null = alcança; senão, o porquê legível. */
function porQueFrenteRecusa(
  frente: FrenteEscala,
  a: AlvoDaFrente,
  escalaRestringeEspecialidade: boolean,
): string | null {
  if (frente.tipo === 'modalidade') {
    return a.modalidadeId === frente.modalidadeId
      ? null
      : 'O período é de outra modalidade (frente de modalidade).';
  }
  return escalaRestringeEspecialidade && !daEspecialidade(frente.especialidadeId, a)
    ? 'O período é de outra especialidade.'
    : null;
}

/**
 * O período cobre o exame pela frente (especialidade ou modalidade) e pelo recorte de segmento da
 * alocação, sem olhar a grade de recebimento nem a prioridade (o recolhimento usa só isto).
 */
export function periodoCobreExame(
  p: Pick<PeriodoEscala, 'frente' | 'subespecialidadeIds' | 'subespecialidadeGeral'>,
  a: AlvoDaFrente,
  escalaRestringeEspecialidade: boolean,
): boolean {
  return (
    porQueFrenteRecusa(p.frente, a, escalaRestringeEspecialidade) === null &&
    casaSegmento(p, a.subespecialidadeId)
  );
}

/** O período aceita o exame? Null = aceita; senão, o porquê legível. */
export function porQuePeriodoRecusa(
  p: PeriodoEscala,
  a: AlvoExame,
  ctx: ContextoPeriodo,
): string | null {
  const frente = porQueFrenteRecusa(p.frente, a, ctx.escalaRestringeEspecialidade);
  if (frente) return frente;

  const liberada =
    a.prioridadeOperacaoId !== null && !!ctx.prioridadesLiberadas?.has(a.prioridadeOperacaoId);
  if (!p.gratificado && !liberada) {
    const regra = ctx.grade.regra(a.prioridadeOperacaoId, p.turnoId, p.frente);
    if (regra.tipo !== 'segue_sla' && !urgenciaPelaAlocacao(p, a, ctx)) {
      if (regra.tipo === 'nao_recebe') {
        return 'Recebimento: este turno não recebe a prioridade do exame.';
      }
      if (!ctx.segueSlaNoDia && (a.restanteMin ?? -1) <= regra.horas * 60) {
        return `Recebimento: o prazo ${a.restanteMin === null ? 'ilegível' : `(${horas(a.restanteMin)}h)`} não passa do mínimo de ${regra.horas}h deste turno.`;
      }
    }
    if (p.lista && ctx.segueSlaNoDia && ctx.cortePosteriores) {
      const corte =
        (a.especialidadeId !== null ? ctx.cortePosteriores.get(a.especialidadeId) : undefined) ??
        (a.modalidadeId !== null ? ctx.cortePosteriores.get(a.modalidadeId) : undefined);
      if (corte !== undefined && a.restanteMin !== null && a.restanteMin <= corte) {
        return `Lista (segue o SLA no dia): vence em ${horas(a.restanteMin)}h, antes do fim dos turnos posteriores; fica para eles.`;
      }
    }
  }

  if (!casaPrioridade(p.prioridadeIds, a, ctx.prioridadesLiberadas)) {
    return a.prioridadeOperacaoId === null
      ? 'O período recorta prioridades e a do exame não tem de-para na operação.'
      : 'O período não aceita a prioridade do exame (não está marcada na alocação).';
  }
  if (!casaSegmento(p, a.subespecialidadeId)) return 'O período não aceita o segmento do exame.';
  return null;
}

/** Algum período que aceitou o exame nomeia o segmento dele (o geral não fura nada). */
export function escalaMarcaSegmento(
  aceitos: readonly { subespecialidadeIds: readonly string[] }[],
  subespecialidadeId: string | null,
): boolean {
  return (
    subespecialidadeId !== null &&
    aceitos.some((p) => p.subespecialidadeIds.includes(subespecialidadeId))
  );
}

/**
 * O segmento único de uma lista de recortes (arranjos ou períodos): todos recortam o mesmo e
 * único segmento, sem o geral. O teto do segmento não vale para quem só tem ele a laudar.
 */
export function segmentoUnico(
  recortes: readonly { subespecialidadeIds: readonly string[]; subespecialidadeGeral: boolean }[],
): string | null {
  if (!recortes.length) return null;
  const ids = new Set<string>();
  for (const r of recortes) {
    if (r.subespecialidadeGeral || r.subespecialidadeIds.length !== 1) return null;
    ids.add(r.subespecialidadeIds[0] as string);
  }
  return ids.size === 1 ? ([...ids][0] as string) : null;
}
