import { z } from 'zod';

import type { FilaDoMomentoDto } from '../../gen/types/FilaDoMomentoDto';
import type { RecortesRodadaDto } from '../../gen/types/RecortesRodadaDto';

const opcao = z.object({ valor: z.string(), rotulo: z.string() });
export const esquemaDistribuir = (temTurnos: boolean) =>
  z.object({
    turnoIds: temTurnos
      ? z.array(z.string()).min(1, 'Marque ao menos um turno.')
      : z.array(z.string()),
    frenteIds: z.array(z.string()),
    prioridadeIds: z.array(z.string()),
    clientes: z.array(opcao),
    tirar: z.array(z.string()),
    incluir: z.array(opcao),
  });
export type ValoresDistribuir = z.infer<ReturnType<typeof esquemaDistribuir>>;

/** Tudo marcado = sem recorte naquele eixo (lista vazia na API). */
const recorte = (marcados: readonly string[], todos: readonly string[]) =>
  todos.length > 0 && todos.every((id) => marcados.includes(id)) ? [] : [...marcados];

export function recortesDoFormulario(
  v: ValoresDistribuir,
  fila: FilaDoMomentoDto,
): RecortesRodadaDto {
  const frentes = fila.porFrente.flatMap((f) => (f.frenteId ? [f.frenteId] : []));
  const prioridades = fila.prioridades.flatMap((p) =>
    p.prioridadeOperacaoId ? [p.prioridadeOperacaoId] : [],
  );
  return {
    turnoIds: recorte(
      v.turnoIds,
      fila.turnos.map((t) => t.turnoId),
    ),
    frenteIds: recorte(v.frenteIds, frentes),
    prioridadeOperacaoIds: recorte(v.prioridadeIds, prioridades),
    clienteIds: v.clientes.map((c) => c.valor),
    medicosExcluidos: v.tirar,
    medicosIncluidos: v.incluir.map((m) => m.valor).filter((id) => !v.tirar.includes(id)),
  };
}

/** Quantos exames e médicos a rodada pegaria com os recortes (aproximado: o motor decide). */
export function estimativa(v: ValoresDistribuir, fila: FilaDoMomentoDto) {
  const todasFrentes = fila.porFrente.every((f) => !f.frenteId || v.frenteIds.includes(f.frenteId));
  const exames = fila.porFrente
    .filter((f) => (f.frenteId ? v.frenteIds.includes(f.frenteId) : todasFrentes))
    .flatMap((f) => f.porPrioridade)
    .filter((p) => !p.prioridadeOperacaoId || v.prioridadeIds.includes(p.prioridadeOperacaoId))
    .reduce((s, p) => s + p.exames, 0);
  const medicos = new Set(
    fila.medicosEmTurno
      .filter((m) => v.turnoIds.includes(m.turnoId) && !v.tirar.includes(m.medicoId))
      .map((m) => m.medicoId),
  );
  for (const m of v.incluir) if (!v.tirar.includes(m.valor)) medicos.add(m.valor);
  return { exames, medicos: medicos.size };
}
