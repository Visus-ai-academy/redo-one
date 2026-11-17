import type { Arranjo, FrenteEscala, ModoVinculo } from '../arranjo';
import type { RegrasPorFrente } from './configuracao';

/**
 * Elegibilidade de um médico para um exame: o casamento do arranjo, o direcionamento das equipes,
 * a clínica exclusiva e o recorte de cada período da escala. Fonte: dashboards-one
 * `src/lib/services/distribuicao/arranjo.ts`. Diferenças de propósito: tudo por id do catálogo (o
 * legado comparava nomes normalizados) e as regras da Lista vêm da frente do período, não de uma
 * configuração global com RX fixo no código.
 */

/** O exame como a elegibilidade o vê, já resolvido contra o catálogo. */
export interface AlvoExame {
  especialidadeId: string | null;
  /** Especialidades a que o segmento do exame pertence (COLUNAS é de NEURO e de MSK). */
  especialidadesDoSegmento: readonly string[];
  modalidadeId: string | null;
  subespecialidadeId: string | null;
  /** Prioridade do catálogo, já traduzida pelas variações (Internado → ROTINA). */
  prioridadeId: string | null;
  exameId: string | null;
  clienteId: string | null;
  /** Minutos até o prazo; negativo = vencido; null = ilegível. */
  restanteMin: number | null;
}

/** O exame é da especialidade: a dele ou uma alcançada pelo segmento. */
function daEspecialidade(especialidadeId: string, alvo: AlvoExame): boolean {
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

export interface OpcoesCasamento {
  /** Prioridades liberadas pelo ajuste do dia do médico: furam só o eixo da prioridade. */
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
  const liberada =
    alvo.prioridadeId !== null && !!opcoes.prioridadesLiberadas?.has(alvo.prioridadeId);
  if (
    !liberada &&
    a.prioridadeIds.length &&
    (alvo.prioridadeId === null || !a.prioridadeIds.includes(alvo.prioridadeId))
  ) {
    return false;
  }
  if (alvo.exameId && !atende(a.modoExames, a.exameIds.includes(alvo.exameId))) return false;
  if (alvo.clienteId && !atende(a.modoClientes, a.clienteIds.includes(alvo.clienteId)))
    return false;
  return true;
}

/**
 * Algum arranjo que casa o exame inclui a prioridade dele (marcada ou "todas"): o cadastro pediu,
 * então a Lista não barra a prioridade (o prazo mínimo segue valendo).
 */
export function arranjoMarcaPrioridade(
  arranjos: readonly Arranjo[],
  alvo: AlvoExame,
  opcoes: OpcoesCasamento = {},
): boolean {
  const p = alvo.prioridadeId;
  return (
    p !== null &&
    arranjos.some(
      (a) =>
        (!a.prioridadeIds.length || a.prioridadeIds.includes(p)) && casaArranjo(a, alvo, opcoes),
    )
  );
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
  /** Turno do tipo Lista e não gratificado: segue a regra da Lista da frente. */
  lista: boolean;
  /** Escala gratificada: segue o SLA puro, com cota à parte. */
  gratificado: boolean;
  frente: FrenteEscala;
  /** Recortes da alocação; vazio = sem recorte. */
  prioridadeIds: readonly string[];
  subespecialidadeIds: readonly string[];
  subespecialidadeGeral: boolean;
  /** Período de cobertura: o titular que ele cobre. */
  coberturaDeId: string | null;
}

export interface ContextoPeriodo {
  escalaRestringeEspecialidade: boolean;
  regras: RegrasPorFrente;
  /** Prioridades liberadas pelo ajuste do dia do médico. */
  prioridadesLiberadas?: ReadonlySet<string>;
  /** Ajuste do dia "a Lista segue o SLA". */
  listaSegueSla?: boolean;
  /** Ver `arranjoMarcaPrioridade`. */
  arranjoMarcaPrioridade?: boolean;
  /** Frente (id da especialidade ou modalidade) → minutos até o fim dos turnos posteriores. */
  cortePosteriores?: ReadonlyMap<string, number>;
}

const horas = (min: number) => Math.round(min / 60);

/** O período aceita o exame? Null = aceita; senão, o porquê legível. */
export function porQuePeriodoRecusa(
  p: PeriodoEscala,
  a: AlvoExame,
  ctx: ContextoPeriodo,
): string | null {
  if (p.frente.tipo === 'modalidade') {
    if (a.modalidadeId !== p.frente.modalidadeId) {
      return 'O período é de outra modalidade (frente de modalidade).';
    }
  } else if (ctx.escalaRestringeEspecialidade && !daEspecialidade(p.frente.especialidadeId, a)) {
    return 'O período é de outra especialidade.';
  }

  const liberada = a.prioridadeId !== null && !!ctx.prioridadesLiberadas?.has(a.prioridadeId);
  if (p.lista && !liberada) {
    if (!ctx.listaSegueSla) {
      const regras = ctx.regras.daFrente(p.frente);
      if (regras) {
        const aceitas = regras.listaPrioridadeIds;
        if (
          !ctx.arranjoMarcaPrioridade &&
          aceitas.length &&
          (a.prioridadeId === null || !aceitas.includes(a.prioridadeId))
        ) {
          return 'Lista: a prioridade do exame não entra na Lista desta frente.';
        }
        const peloSla =
          !!ctx.arranjoMarcaPrioridade &&
          a.prioridadeId !== null &&
          regras.listaUrgenciaPeloSlaPrioridadeIds.includes(a.prioridadeId);
        const minimo = regras.listaPrazoMinimoHoras;
        if (!peloSla && minimo !== null && (a.restanteMin ?? -1) <= minimo * 60) {
          return `Lista: o prazo ${a.restanteMin === null ? 'ilegível' : `(${horas(a.restanteMin)}h)`} não passa do mínimo de ${minimo}h.`;
        }
      }
    } else if (ctx.cortePosteriores) {
      const corte =
        (a.especialidadeId !== null ? ctx.cortePosteriores.get(a.especialidadeId) : undefined) ??
        (a.modalidadeId !== null ? ctx.cortePosteriores.get(a.modalidadeId) : undefined);
      if (corte !== undefined && a.restanteMin !== null && a.restanteMin <= corte) {
        return `Lista (segue o SLA): vence em ${horas(a.restanteMin)}h, antes do fim dos turnos posteriores; fica para eles.`;
      }
    }
  }

  if (
    p.prioridadeIds.length &&
    !liberada &&
    (a.prioridadeId === null || !p.prioridadeIds.includes(a.prioridadeId))
  ) {
    return 'O período não aceita a prioridade do exame.';
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
