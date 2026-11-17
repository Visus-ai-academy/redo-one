// Por médico: o mês dele em calendário (computador) e o resumo do topo.
import type { OcorrenciaDto } from '../../gen/types/OcorrenciaDto';
import { resumoDoMedico } from './agrupar';
import { diaDaSemana, diasDaSemanaVisiveis, semanasDoMes } from './calendario';

/** Um dia da grade: os plantões dele, em ordem; `doMes` falso nos dias dos meses vizinhos. */
export type DiaDoMedico = { data: string; doMes: boolean; plantoes: OcorrenciaDto[] };

/** Os plantões em ordem: dia, turno, frente e hora de início. */
export function ordenarPlantoes(ocorrencias: readonly OcorrenciaDto[]) {
  return [...ocorrencias].sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      a.turnoOrdem - b.turnoOrdem ||
      a.turnoNome.localeCompare(b.turnoNome) ||
      a.frenteOrdem - b.frenteOrdem ||
      a.inicio.localeCompare(b.inicio),
  );
}

/**
 * As semanas do mês com os plantões em cada dia. Colunas de seg a sex; sáb e dom só se algum
 * deles tem plantão (ou ausência) na grade, ou com o alternador "Fim de semana".
 */
export function calendarioDoMedico({
  data,
  ocorrencias,
  mostrarFimDeSemana = false,
}: {
  /** Qualquer dia do mês mostrado. */
  data: string;
  ocorrencias: readonly OcorrenciaDto[];
  mostrarFimDeSemana?: boolean;
}) {
  const mes = data.slice(0, 7);
  const porDia = new Map<string, OcorrenciaDto[]>();
  for (const o of ordenarPlantoes(ocorrencias)) {
    porDia.set(o.data, [...(porDia.get(o.data) ?? []), o]);
  }
  const todas = semanasDoMes(data);
  const colunas = diasDaSemanaVisiveis(
    todas.flat(),
    (dia) => mostrarFimDeSemana || porDia.has(dia),
  );
  const semanas: DiaDoMedico[][] = todas.map((semana) =>
    semana
      .filter((dia) => colunas.includes(diaDaSemana(dia)))
      .map((dia) => ({
        data: dia,
        doMes: dia.slice(0, 7) === mes,
        plantoes: porDia.get(dia) ?? [],
      })),
  );
  return { colunas, semanas };
}

/** Só os plantões do mês de `data` (a grade traz também os dias dos meses vizinhos). */
export function doMes<T extends { data: string }>(ocorrencias: readonly T[], data: string) {
  const mes = data.slice(0, 7);
  return ocorrencias.filter((o) => o.data.slice(0, 7) === mes);
}

/** O topo da visão: quantos plantões no mês e as linhas por frente, turno e horário. */
export function resumoDoMes(ocorrencias: readonly OcorrenciaDto[], data: string) {
  const domes = doMes(ocorrencias, data);
  return { total: domes.length, linhas: resumoDoMedico(domes) };
}
