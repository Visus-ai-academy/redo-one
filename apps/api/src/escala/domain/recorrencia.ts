import { EscalaInvalidaError } from './errors';

/**
 * Datas da escala: "YYYY-MM-DD" puras, no calendário de Brasília (sem hora nem fuso). A conta é
 * feita em UTC só como aritmética de calendário.
 */
export type Data = string;

const DIA_MS = 86_400_000;

const paraUtc = (data: Data) => Date.parse(`${data}T00:00:00Z`);
const deUtc = (ms: number): Data => new Date(ms).toISOString().slice(0, 10);

export function validarData(valor: string): Data {
  const texto = valor.trim();
  const ms = paraUtc(texto);
  // Data inexistente (31/02) não volta igual; `Date.parse` de formato errado dá NaN.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto) || Number.isNaN(ms) || deUtc(ms) !== texto) {
    throw new EscalaInvalidaError(`Data inválida: "${texto}". Use AAAA-MM-DD.`);
  }
  return texto;
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(data: Data): number {
  return new Date(paraUtc(data)).getUTCDay();
}

export function adicionarDias(data: Data, dias: number): Data {
  return deUtc(paraUtc(data) + dias * DIA_MS);
}

/** Quantos dias tem o intervalo [de, ate], com as duas pontas. */
export function diasNoIntervalo(de: Data, ate: Data): number {
  return Math.round((paraUtc(ate) - paraUtc(de)) / DIA_MS) + 1;
}

/** Dias da semana sem repetição e em ordem; recusa valor fora de 0..6. */
export function normalizarDiasSemana(dias: readonly number[]): number[] {
  if (dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new EscalaInvalidaError('Dia da semana inválido: use 0 (domingo) a 6 (sábado).');
  }
  return [...new Set(dias)].sort((a, b) => a - b);
}

/** Semanas do mês aceitas: 1ª a 5ª e -1 (última). */
export const SEMANAS_DO_MES = [1, 2, 3, 4, 5, -1] as const;

/** Sem repetição, em ordem e com a última (-1) no fim; recusa valor fora da lista. */
export function normalizarSemanasDoMes(semanas: readonly number[]): number[] {
  if (semanas.some((s) => !(SEMANAS_DO_MES as readonly number[]).includes(s))) {
    throw new EscalaInvalidaError('Semana do mês inválida: use 1 a 5 ou a última.');
  }
  const ordem = (s: number) => (s < 0 ? 9 : s);
  return [...new Set(semanas)].sort((a, b) => ordem(a) - ordem(b));
}

/**
 * O dia cai numa das semanas do mês marcadas? Vazio = toda semana. A semana do dia é a ordem dele
 * entre os mesmos dias da semana do mês (ceil(dia/7)); a última é o dia cuja semana seguinte já é
 * outro mês. Fim de semana não se parte: com sábado em `diasSemanaReferencia`, o domingo conta pelo
 * sábado da véspera (o 01/11/2026 fecha o fim de semana de 31/10).
 * Fonte: dashboards-one `src/lib/utils/semanasDoMes.ts` `caiNasSemanas`.
 */
export function caiNasSemanas(
  data: Data,
  semanas: readonly number[],
  diasSemanaReferencia: readonly number[],
): boolean {
  if (semanas.length === 0) return true;
  const ancora =
    diaDaSemana(data) === 0 && diasSemanaReferencia.includes(6) ? adicionarDias(data, -1) : data;
  const d = new Date(paraUtc(ancora));
  const dia = d.getUTCDate();
  const ultimoDoMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return semanas.includes(Math.ceil(dia / 7)) || (semanas.includes(-1) && dia + 7 > ultimoDoMes);
}

/** Recorrência de uma alocação: dias da semana, semanas do mês e vigência. */
export interface RegraRecorrencia {
  diasSemana: readonly number[];
  semanasDoMes: readonly number[];
  dataInicio: Data;
  /** Nulo = sem fim. */
  dataFim: Data | null;
}

/**
 * A regra vale na data? Dia da semana marcado, semana do mês marcada e dentro da vigência
 * (início ≤ data ≤ fim, sem fim = para sempre). `diasSemanaDasSemanas` troca os dias usados para
 * contar as semanas (a cobertura conta pelos dias do titular).
 */
export function caiNoDia(
  regra: RegraRecorrencia,
  data: Data,
  diasSemanaDasSemanas: readonly number[] = regra.diasSemana,
): boolean {
  if (data < regra.dataInicio) return false;
  if (regra.dataFim !== null && data > regra.dataFim) return false;
  return (
    regra.diasSemana.includes(diaDaSemana(data)) &&
    caiNasSemanas(data, regra.semanasDoMes, diasSemanaDasSemanas)
  );
}

/**
 * Um ano basta para achar um dia de qualquer regra (a 5ª semana de cada dia da semana aparece
 * várias vezes por ano); evita varrer vigências longas ou sem fim.
 */
const DIAS_PARA_ACHAR_UM_DIA = 371;

/** Algum dia da vigência cai na regra? Sem fim, olha o primeiro ano. */
export function existeDiaNoPeriodo(
  regra: RegraRecorrencia,
  diasSemanaDasSemanas: readonly number[] = regra.diasSemana,
): boolean {
  for (let i = 0; i < DIAS_PARA_ACHAR_UM_DIA; i++) {
    const data = adicionarDias(regra.dataInicio, i);
    if (regra.dataFim !== null && data > regra.dataFim) return false;
    if (caiNoDia(regra, data, diasSemanaDasSemanas)) return true;
  }
  return false;
}
