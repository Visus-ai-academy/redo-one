import { z } from 'zod';

import type { FilaDoMomentoDto } from '../../gen/types/FilaDoMomentoDto';
import type { RecortesRodadaDto } from '../../gen/types/RecortesRodadaDto';
import type { SegmentoDaFilaDto } from '../../gen/types/SegmentoDaFilaDto';

const opcao = z.object({ valor: z.string(), rotulo: z.string() });
export const esquemaDistribuir = (temTurnos: boolean) =>
  z.object({
    turnoIds: temTurnos
      ? z.array(z.string()).min(1, 'Marque ao menos um turno.')
      : z.array(z.string()),
    frenteIds: z.array(z.string()),
    prioridadeIds: z.array(z.string()),
    subespecialidadeIds: z.array(z.string()),
    clientes: z.array(opcao),
    tirar: z.array(z.string()),
    incluir: z.array(opcao),
  });
export type ValoresDistribuir = z.infer<ReturnType<typeof esquemaDistribuir>>;

/** Valor da caixa "Sem subespecialidade" no formulário; na API vira `subespecialidadeGeral`. */
export const SEM_SUBESPECIALIDADE = 'sem-subespecialidade';

export type OpcaoSubespecialidade = {
  valor: string;
  rotulo: string;
  cor: string | null;
  exames: number;
};

/**
 * As subespecialidades da fila (só a frente de especialidade se quebra por elas), somadas pelo id;
 * o nome repetido em ids diferentes leva a frente entre parênteses. "Sem subespecialidade" por último.
 */
export function opcoesSubespecialidade(fila: FilaDoMomentoDto): OpcaoSubespecialidade[] {
  const porId = new Map<string, OpcaoSubespecialidade & { frentes: string[] }>();
  for (const f of fila.porFrente) {
    for (const sg of f.porSegmento) {
      const valor = sg.segmentoId ?? SEM_SUBESPECIALIDADE;
      const o = porId.get(valor) ?? { valor, rotulo: sg.nome, cor: sg.cor, exames: 0, frentes: [] };
      o.exames += sg.exames;
      o.frentes.push(f.nome);
      porId.set(valor, o);
    }
  }
  const opcoes = [...porId.values()];
  if (!opcoes.some((o) => o.valor !== SEM_SUBESPECIALIDADE)) return [];
  const repetido = (o: OpcaoSubespecialidade) =>
    opcoes.filter((x) => x.rotulo === o.rotulo).length > 1;
  return opcoes
    .map(({ frentes, ...o }) =>
      o.valor !== SEM_SUBESPECIALIDADE && repetido(o)
        ? { ...o, rotulo: `${o.rotulo} (${frentes.join(', ')})` }
        : o,
    )
    .sort(
      (a, b) =>
        Number(a.valor === SEM_SUBESPECIALIDADE) - Number(b.valor === SEM_SUBESPECIALIDADE) ||
        a.rotulo.localeCompare(b.rotulo, 'pt-BR'),
    );
}

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
  const subespecialidades = recorte(
    v.subespecialidadeIds,
    opcoesSubespecialidade(fila).map((o) => o.valor),
  );
  return {
    turnoIds: recorte(
      v.turnoIds,
      fila.turnos.map((t) => t.turnoId),
    ),
    frenteIds: recorte(v.frenteIds, frentes),
    prioridadeOperacaoIds: recorte(v.prioridadeIds, prioridades),
    subespecialidadeIds: subespecialidades.filter((id) => id !== SEM_SUBESPECIALIDADE),
    subespecialidadeGeral: subespecialidades.includes(SEM_SUBESPECIALIDADE),
    clienteIds: v.clientes.map((c) => c.valor),
    medicosExcluidos: v.tirar,
    medicosIncluidos: v.incluir.map((m) => m.valor).filter((id) => !v.tirar.includes(id)),
  };
}

/** Quantos exames e médicos a rodada pegaria com os recortes (aproximado: o motor decide). */
export function estimativa(v: ValoresDistribuir, fila: FilaDoMomentoDto) {
  const todasFrentes = fila.porFrente.every((f) => !f.frenteId || v.frenteIds.includes(f.frenteId));
  const subs = opcoesSubespecialidade(fila).map((o) => o.valor);
  const todasSubs = subs.every((id) => v.subespecialidadeIds.includes(id));
  const exames = fila.porFrente
    .filter((f) => (f.frenteId ? v.frenteIds.includes(f.frenteId) : todasFrentes))
    // A frente sem quebra por subespecialidade conta como sem subespecialidade.
    .flatMap((f): Pick<SegmentoDaFilaDto, 'segmentoId' | 'porPrioridade'>[] =>
      f.porSegmento.length ? f.porSegmento : [{ segmentoId: null, porPrioridade: f.porPrioridade }],
    )
    .filter(
      (sg) => todasSubs || v.subespecialidadeIds.includes(sg.segmentoId ?? SEM_SUBESPECIALIDADE),
    )
    .flatMap((sg) => sg.porPrioridade)
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
