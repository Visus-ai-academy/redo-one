import type { FrenteEscala } from '../arranjo';
import { periodoCobreExame } from '../motor/elegibilidade';
import type { EntregaAnterior } from '../motor/medicos-disponiveis';
import { normalizarGrafia } from '../motor/prioridades-operacao';
import type { ExameDaLeitura, ExameEmMaosDaLeitura } from './entrada';

/**
 * RECOLHIMENTO: o exame que o robô entregou, que o médico não abriu e que nenhum turno em curso
 * dele cobre mais (com a carência; a Lista, só a da entrega) volta para a rodada, para ir a outro
 * médico. Fonte:
 * dashboards-one `services/distribuicao/recolher.ts` (`listarRecolhiveis`) e
 * `distribuicao/recolhimento.ts` (`protegidoPelaEscala`), sem banco. Diferenças decididas: sem o
 * limite de 3 dias para trás (`DIAS_PARA_TRAS`), 18/11/2026; e vale a escala de agora que cobre o
 * exame, não o turno da entrega (que fazia médicos em turno trocarem exames entre si), 19/11/2026.
 */

/** Só o exame intocado (NOVO na MobileMed) sai do médico. */
const STATUS_NOVO = 'NOVO';

/** Exame que está com um médico na MobileMed. */
export interface ExameComMedico {
  idExame: string;
  medicoIdMobilemed: number;
  status: string;
  /** HMAC do paciente: o pacote é paciente × médico. */
  pacienteChave: string;
  especialidadeId: string | null;
  modalidadeId: string | null;
  subespecialidadeId: string | null;
  /** Especialidades a que o segmento do exame pertence (COLUNAS é de NEURO e de MSK). */
  especialidadesDoSegmento: readonly string[];
}

/** A última entrega do robô (designação executada): quem é o dono pelo robô e desde quando. */
export interface UltimaEntrega {
  medicoId: string;
  em: Date;
}

/** Um período da escala do médico (ocorrência), no que o recolhimento lê. */
export interface PeriodoDoMedico {
  medicoId: string;
  inicio: Date;
  fim: Date;
  /** O turno da escala: o prazo do recolhimento pode ser próprio dele. */
  turnoId: string;
  /** Turno do tipo Lista: só segura o que foi entregue nela. */
  lista: boolean;
  /** Ocorrência com ausência: não protege ninguém. */
  ausente: boolean;
  frente: FrenteEscala;
  /** Recorte de segmento da alocação, com o "todos" explícito. */
  todosSegmentos: boolean;
  subespecialidadeIds: readonly string[];
  subespecialidadeGeral: boolean;
}

/** Ausência aprovada que cobre hoje (o dia inteiro). `frentes` vazio = todas. */
export interface AusenciaDoDia {
  medicoId: string;
  frentes: readonly FrenteEscala[];
}

/** Os números da configuração (Configurações › Distribuição). */
export interface ParametrosRecolhimento {
  /** Minutos depois do fim do último turno que cobre o exame (o prazo padrão). */
  carenciaMin: number;
  /** Turno → o prazo próprio dele, no lugar do padrão (a Lista, 24 h no dashboards-one). */
  carenciaPorTurno: ReadonlyMap<string, number>;
  /** A antecedência do período: o turno que vai começar já segura o exame. */
  antecedenciaMin: number;
  /** A frente de especialidade recorta o exame (a mesma chave do motor). */
  escalaRestringeEspecialidade: boolean;
}

export interface EntradaRecolhimento {
  agora: Date;
  /** Null = recolhimento desligado (carência nula na configuração). */
  parametros: ParametrosRecolhimento | null;
  exames: readonly ExameComMedico[];
  /** Exame (id na MobileMed) → a última entrega do robô. */
  entregas: ReadonlyMap<string, UltimaEntrega>;
  /**
   * Médico → as contas dele na MobileMed, a principal e as outras (os das entregas e os ausentes):
   * o exame em qualquer uma está com ele.
   */
  contas: ReadonlyMap<string, readonly number[]>;
  periodos: readonly PeriodoDoMedico[];
  ausencias: readonly AusenciaDoDia[];
  /** A frente do exame recolhe ao fim do turno (`recolheAoFimDoTurno`)? */
  recolhe: (e: { especialidadeId: string | null; modalidadeId: string | null }) => boolean;
}

export const MOTIVOS_RECOLHIMENTO = ['turno_encerrado', 'ausencia'] as const;
export type MotivoRecolhimento = (typeof MOTIVOS_RECOLHIMENTO)[number];

export interface ExameRecolhido {
  idExame: string;
  deMedicoId: string;
  /** A conta em que o exame estava na leitura (a troca só acontece se ele segue nela). */
  deMedicoIdMobilemed: number;
  motivo: MotivoRecolhimento;
}

/** Por que um exame que podia ser recolhido ficou com o médico. */
export type MotivoFica =
  | 'aberto'
  | 'trocado_por_fora'
  | 'pacote_aberto'
  | 'turno_em_curso'
  | 'frente_nao_recolhe';

export const MOTIVOS_FICA: readonly MotivoFica[] = [
  'aberto',
  'trocado_por_fora',
  'pacote_aberto',
  'turno_em_curso',
  'frente_nao_recolhe',
];

export interface Recolhimento {
  recolhidos: ExameRecolhido[];
  /** Dos candidatos (entregues pelo robô, irmãos e os do ausente), os que ficaram, por motivo. */
  ficaram: Record<MotivoFica, number>;
}

const MIN = 60_000;

/**
 * Algum período do médico em curso agora cobre o exame? Em curso = da antecedência antes do início
 * até a carência depois do fim (a do turno, se ele tem prazo próprio); cobre = a frente (especialidade ou
 * modalidade) e o recorte de segmento, como na elegibilidade do motor. O período com ausência não
 * protege. No turno comum não importa em que turno o exame foi entregue; a Lista só segura o que
 * foi entregue nela (recebe na terça para laudar até quarta, volta na quinta), senão a Lista de
 * todo dia segurava a sobra para sempre (dashboards-one, 23/10 e 03/11; usuário, 19/11/2026).
 */
export function protegidoPelaEscala(
  periodos: readonly PeriodoDoMedico[],
  exame: ExameComMedico,
  entregueEm: Date,
  agora: Date,
  p: ParametrosRecolhimento,
): boolean {
  const t = agora.getTime();
  const e = entregueEm.getTime();
  return periodos.some(
    (j) =>
      !j.ausente &&
      j.inicio.getTime() - p.antecedenciaMin * MIN <= t &&
      t < j.fim.getTime() + (p.carenciaPorTurno.get(j.turnoId) ?? p.carenciaMin) * MIN &&
      (!j.lista || (j.inicio.getTime() - p.antecedenciaMin * MIN <= e && e < j.fim.getTime())) &&
      periodoCobreExame(j, exame, p.escalaRestringeEspecialidade),
  );
}

const casaFrente = (f: FrenteEscala, e: ExameComMedico) =>
  f.tipo === 'especialidade'
    ? f.especialidadeId === e.especialidadeId
    : f.modalidadeId === e.modalidadeId;

/**
 * Os exames que saem do médico nesta rodada. Regras do dashboards-one mantidas:
 * - só o que o robô deu e segue NOVO com o MESMO médico (trocado à mão depois fica com quem trocou);
 * - o pacote paciente × médico sai inteiro ou fica inteiro: nada sai se algum exame dele está
 *   aberto, ainda protegido pela escala ou é de frente que não recolhe; os irmãos NOVO sem
 *   designação do robô saem junto;
 * - médico com ausência aprovada que cobre hoje perde todo exame NOVO (das frentes da ausência),
 *   mesmo os que o robô não deu, e a escala não o segura.
 */
export function recolher(entrada: EntradaRecolhimento): Recolhimento {
  const ficaram = Object.fromEntries(MOTIVOS_FICA.map((m) => [m, 0])) as Record<MotivoFica, number>;
  const p = entrada.parametros;
  if (!p) return { recolhidos: [], ficaram };

  const novo = (e: ExameComMedico) => normalizarGrafia(e.status) === STATUS_NOVO;
  // Conta → médico: o pacote é do médico, em qualquer conta dele.
  const medicoDaConta = new Map<number, string>();
  for (const [medicoId, contas] of entrada.contas) {
    for (const conta of contas) medicoDaConta.set(conta, medicoId);
  }
  const ehDele = (medicoId: string, e: ExameComMedico) =>
    entrada.contas.get(medicoId)?.includes(e.medicoIdMobilemed) ?? false;
  const pacoteDe = (e: ExameComMedico) =>
    `${e.pacienteChave}|${medicoDaConta.get(e.medicoIdMobilemed) ?? `conta:${e.medicoIdMobilemed}`}`;

  // Ausência de hoje por médico: null = todas as frentes.
  const ausenteEm = new Map<string, FrenteEscala[] | null>();
  for (const a of entrada.ausencias) {
    if (ausenteEm.get(a.medicoId) === null) continue;
    if (!a.frentes.length) ausenteEm.set(a.medicoId, null);
    else ausenteEm.set(a.medicoId, [...(ausenteEm.get(a.medicoId) ?? []), ...a.frentes]);
  }
  const ausenteNoExame = (medicoId: string, e: ExameComMedico) => {
    if (!ausenteEm.has(medicoId)) return false;
    const frentes = ausenteEm.get(medicoId);
    return !frentes || frentes.some((f) => casaFrente(f, e));
  };
  const ausentePorConta = new Map<number, string>();
  for (const medicoId of ausenteEm.keys()) {
    for (const conta of entrada.contas.get(medicoId) ?? []) ausentePorConta.set(conta, medicoId);
  }
  const periodosDe = new Map<string, PeriodoDoMedico[]>();
  for (const o of entrada.periodos) {
    periodosDe.set(o.medicoId, [...(periodosDe.get(o.medicoId) ?? []), o]);
  }

  const abertos = new Set(entrada.exames.filter((e) => !novo(e)).map(pacoteDe));
  // Pacote preso com o médico, e por quê (a frente que não recolhe vale para o pacote inteiro).
  const presos = new Map<string, MotivoFica>();
  for (const e of entrada.exames) {
    if (!entrada.recolhe(e)) presos.set(pacoteDe(e), 'frente_nao_recolhe');
  }
  const prender = (pacote: string) => {
    if (!presos.has(pacote)) presos.set(pacote, 'turno_em_curso');
  };

  const saem = new Map<string, ExameRecolhido>();
  const donoDoPacote = new Map<string, string>();
  const candidatos = new Set<string>();

  for (const e of entrada.exames) {
    const entrega = entrada.entregas.get(e.idExame);
    if (!entrega) continue;
    candidatos.add(e.idExame);
    if (!novo(e)) {
      ficaram.aberto++;
      continue;
    }
    if (!ehDele(entrega.medicoId, e)) {
      ficaram.trocado_por_fora++;
      continue;
    }
    const pacote = pacoteDe(e);
    if (abertos.has(pacote)) continue;
    const ausente = ausenteNoExame(entrega.medicoId, e);
    if (
      !ausente &&
      protegidoPelaEscala(periodosDe.get(entrega.medicoId) ?? [], e, entrega.em, entrada.agora, p)
    ) {
      prender(pacote);
      continue;
    }
    saem.set(e.idExame, {
      idExame: e.idExame,
      deMedicoId: entrega.medicoId,
      deMedicoIdMobilemed: e.medicoIdMobilemed,
      motivo: ausente ? 'ausencia' : 'turno_encerrado',
    });
    donoDoPacote.set(pacote, entrega.medicoId);
  }

  // Os irmãos sem designação do robô vão com o pacote.
  for (const e of entrada.exames) {
    const dono = donoDoPacote.get(pacoteDe(e));
    if (!dono || saem.has(e.idExame) || !novo(e) || candidatos.has(e.idExame)) continue;
    candidatos.add(e.idExame);
    saem.set(e.idExame, {
      idExame: e.idExame,
      deMedicoId: dono,
      deMedicoIdMobilemed: e.medicoIdMobilemed,
      motivo: ausenteNoExame(dono, e) ? 'ausencia' : 'turno_encerrado',
    });
  }

  // Os do médico ausente que o robô não deu.
  for (const e of entrada.exames) {
    const medicoId = ausentePorConta.get(e.medicoIdMobilemed);
    if (!medicoId || candidatos.has(e.idExame) || !ausenteNoExame(medicoId, e)) continue;
    candidatos.add(e.idExame);
    if (!novo(e)) {
      ficaram.aberto++;
      continue;
    }
    if (abertos.has(pacoteDe(e))) continue;
    saem.set(e.idExame, {
      idExame: e.idExame,
      deMedicoId: medicoId,
      deMedicoIdMobilemed: e.medicoIdMobilemed,
      motivo: 'ausencia',
    });
  }

  // O pacote aberto conta uma vez por exame candidato NOVO; o preso, todos os candidatos dele.
  for (const e of entrada.exames) {
    if (!candidatos.has(e.idExame) || !novo(e)) continue;
    const pacote = pacoteDe(e);
    const entrega = entrada.entregas.get(e.idExame);
    const trocado = entrega !== undefined && !ehDele(entrega.medicoId, e);
    if (trocado) continue;
    if (abertos.has(pacote)) ficaram.pacote_aberto++;
    else if (presos.has(pacote)) {
      ficaram[presos.get(pacote) as MotivoFica]++;
      saem.delete(e.idExame);
    }
  }

  return {
    recolhidos: entrada.exames.flatMap((e) => {
      const r = saem.get(e.idExame);
      return r ? [r] : [];
    }),
    ficaram,
  };
}

/**
 * A leitura que a rodada distribui: o recolhido sai das mãos do médico (não pesa mais na carga dele)
 * e entra na fila da rodada como o exame sem médico, com o que a MobileMed mostra dele.
 */
export function leituraComRecolhidos<
  L extends {
    semMedico: readonly ExameDaLeitura[];
    emMaos: readonly ExameEmMaosDaLeitura[];
  },
>(leitura: L, recolhidos: readonly ExameRecolhido[]): L {
  if (!recolhidos.length) return leitura;
  const saem = new Set(recolhidos.map((r) => r.idExame));
  const vem = leitura.emMaos
    .filter((e) => saem.has(e.idExame))
    .map(({ medicoIdMobilemed: _, ...e }): ExameDaLeitura => e);
  return {
    ...leitura,
    semMedico: [...leitura.semMedico, ...vem],
    emMaos: leitura.emMaos.filter((e) => !saem.has(e.idExame)),
  };
}

/** O recolhido não volta a quem o tinha: entra nas entregas como do recolhimento. */
export function entregasComRecolhidos(
  porExame: ReadonlyMap<string, readonly EntregaAnterior[]>,
  recolhidos: readonly ExameRecolhido[],
  agora: Date,
): Map<string, EntregaAnterior[]> {
  const mapa = new Map([...porExame].map(([id, es]) => [id, [...es]]));
  for (const r of recolhidos) {
    mapa.set(r.idExame, [
      ...(mapa.get(r.idExame) ?? []),
      { medicoId: r.deMedicoId, em: agora, origem: 'recolhimento' },
    ]);
  }
  return mapa;
}
