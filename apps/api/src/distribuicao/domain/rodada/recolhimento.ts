import type { FrenteEscala } from '../arranjo';
import type { EntregaAnterior } from '../motor/medicos-disponiveis';
import { normalizarGrafia } from '../motor/prioridades-operacao';
import type { ExameDaLeitura, ExameEmMaosDaLeitura } from './entrada';

/**
 * RECOLHIMENTO: o exame que o robô entregou, que o médico não abriu e cujo turno já acabou (mais a
 * carência) volta para a rodada, para ir a outro médico. Fonte: dashboards-one
 * `services/distribuicao/recolher.ts` (`listarRecolhiveis`) e `distribuicao/recolhimento.ts`
 * (`protegidoPelaEscala`), sem banco. Diferença decidida em 18/11/2026: sem o limite de 3 dias
 * para trás (`DIAS_PARA_TRAS`); exame do robô não laudado volta por mais antigo que seja.
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
  /** Turno do tipo Lista: a carência dela é outra. */
  lista: boolean;
  /** Ocorrência com ausência: não protege ninguém. */
  ausente: boolean;
}

/** Ausência aprovada que cobre hoje (o dia inteiro). `frentes` vazio = todas. */
export interface AusenciaDoDia {
  medicoId: string;
  frentes: readonly FrenteEscala[];
}

/** Os números da configuração (Configurações › Distribuição). */
export interface ParametrosRecolhimento {
  /** Minutos depois do fim do turno da entrega. */
  carenciaMin: number;
  /** Minutos depois do fim da Lista (no dashboards-one, 24 h). */
  carenciaListaMin: number;
  /** A antecedência do período (o exame entregue nela é do turno que vai começar). */
  antecedenciaMin: number;
}

export interface EntradaRecolhimento {
  agora: Date;
  /** Null = recolhimento desligado (carência nula na configuração). */
  parametros: ParametrosRecolhimento | null;
  exames: readonly ExameComMedico[];
  /** Exame (id na MobileMed) → a última entrega do robô. */
  entregas: ReadonlyMap<string, UltimaEntrega>;
  /** Médico → conta na MobileMed (os das entregas e os ausentes). */
  contas: ReadonlyMap<string, number | null>;
  periodos: readonly PeriodoDoMedico[];
  ausencias: readonly AusenciaDoDia[];
  /** A frente do exame recolhe ao fim do turno (`recolheAoFimDoTurno`)? */
  recolhe: (e: { especialidadeId: string | null; modalidadeId: string | null }) => boolean;
}

export type MotivoRecolhimento = 'turno_encerrado' | 'ausencia';

export interface ExameRecolhido {
  idExame: string;
  deMedicoId: string;
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
const OFFSET_BRASILIA_MS = -3 * 60 * MIN;
const diaBrasilia = (t: number) => Math.floor((t + OFFSET_BRASILIA_MS) / 86_400_000);

/**
 * O turno da entrega ainda segura o exame com o médico? O turno que conta é o EM QUE O EXAME FOI
 * ENTREGUE (em curso, ou começando dentro da antecedência; antes dela, o próximo do mesmo dia), não
 * "algum turno agora" (com o "agora", a Lista de 24 h segurava a sobra para sempre). Sem período que
 * case com a entrega (rodada fora da escala), vale estar em turno agora. A Lista segura até a
 * carência dela depois do fim; o período com ausência não protege.
 */
export function protegidoPelaEscala(
  periodos: readonly PeriodoDoMedico[],
  entregue: Date,
  agora: Date,
  p: ParametrosRecolhimento,
): boolean {
  const e = entregue.getTime();
  const janelas = periodos.filter((o) => !o.ausente);
  const casam = janelas.filter(
    (j) => j.inicio.getTime() - p.antecedenciaMin * MIN <= e && e < j.fim.getTime(),
  );
  const proximo = janelas
    .filter((j) => j.inicio.getTime() > e && diaBrasilia(j.inicio.getTime()) === diaBrasilia(e))
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())[0];
  const daEntrega = casam.length ? casam : proximo ? [proximo] : [];
  const valem = daEntrega.length ? daEntrega : janelas.filter((j) => j.inicio <= agora);
  return valem.some(
    (j) => agora.getTime() < j.fim.getTime() + (j.lista ? p.carenciaListaMin : p.carenciaMin) * MIN,
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
  const pacoteDe = (e: ExameComMedico) => `${e.pacienteChave}|${e.medicoIdMobilemed}`;

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
    const conta = entrada.contas.get(medicoId);
    if (conta != null) ausentePorConta.set(conta, medicoId);
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
    if (entrada.contas.get(entrega.medicoId) !== e.medicoIdMobilemed) {
      ficaram.trocado_por_fora++;
      continue;
    }
    const pacote = pacoteDe(e);
    if (abertos.has(pacote)) continue;
    const ausente = ausenteNoExame(entrega.medicoId, e);
    if (
      !ausente &&
      protegidoPelaEscala(periodosDe.get(entrega.medicoId) ?? [], entrega.em, entrada.agora, p)
    ) {
      prender(pacote);
      continue;
    }
    saem.set(e.idExame, {
      idExame: e.idExame,
      deMedicoId: entrega.medicoId,
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
    saem.set(e.idExame, { idExame: e.idExame, deMedicoId: medicoId, motivo: 'ausencia' });
  }

  // O pacote aberto conta uma vez por exame candidato NOVO; o preso, todos os candidatos dele.
  for (const e of entrada.exames) {
    if (!candidatos.has(e.idExame) || !novo(e)) continue;
    const pacote = pacoteDe(e);
    const trocado =
      entrada.entregas.has(e.idExame) &&
      entrada.contas.get(entrada.entregas.get(e.idExame)?.medicoId ?? '') !== e.medicoIdMobilemed;
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
