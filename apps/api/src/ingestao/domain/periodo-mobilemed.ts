import { diaBrasilia } from './competencia';

/** Dias inteiros do laudo, "YYYY-MM-DD" em horário de Brasília, inclusive. */
export interface PeriodoDias {
  inicio: string;
  fim: string;
}

/**
 * Período da importação automática: do dia 1º de `mesesAnteriores` meses atrás até hoje, em
 * horário de Brasília (com 1, em 19/11 vai de 01/10 a 19/11, como o RPA antigo).
 */
export function periodoMobileMed(agora: Date, mesesAnteriores: number): PeriodoDias {
  const fim = diaBrasilia(agora);
  const [ano, mes] = fim.split('-').map(Number) as [number, number];
  const inicio = new Date(Date.UTC(ano, mes - 1 - mesesAnteriores, 1)).toISOString().slice(0, 10);
  return { inicio, fim };
}

/** Instantes do período: 00:00 de Brasília do primeiro dia até 00:00 do dia seguinte ao último. */
export function instantesDoPeriodo(p: PeriodoDias): { de: Date; ate: Date } {
  const meiaNoite = (dia: string) => new Date(`${dia}T03:00:00.000Z`);
  const ate = meiaNoite(p.fim);
  ate.setUTCDate(ate.getUTCDate() + 1);
  return { de: meiaNoite(p.inicio), ate };
}
