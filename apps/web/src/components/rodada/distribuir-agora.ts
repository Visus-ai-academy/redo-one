import { z } from 'zod';

import type { FilaDoMomentoDto } from '../../gen/types/FilaDoMomentoDto';
import type { RecortesRodadaDto } from '../../gen/types/RecortesRodadaDto';

const opcao = z.object({ valor: z.string(), rotulo: z.string() });

/** Os eixos que a fila oferece: sem opção nenhuma, o eixo não se marca (fica "todos"). */
export type EixosDaFila = {
  temTurnos: boolean;
  temFrentes: boolean;
  temPrioridades: boolean;
  temSubespecialidades: boolean;
};

/**
 * Vazio nunca é "todos" (25/11/2026): com opções na tela, cada eixo pede ao menos uma marcada (as
 * caixas "Todas as ..." marcam todas); os clientes, "Todos os clientes" ou ao menos um.
 */
export const esquemaDistribuir = (eixos: EixosDaFila) =>
  z
    .object({
      turnoIds: eixos.temTurnos
        ? z.array(z.string()).min(1, 'Marque ao menos um turno.')
        : z.array(z.string()),
      frentesEspecialidade: z.array(z.string()),
      frentesModalidade: z.array(z.string()),
      prioridadeIds: eixos.temPrioridades
        ? z.array(z.string()).min(1, 'Marque ao menos uma prioridade.')
        : z.array(z.string()),
      subespecialidadeIds: eixos.temSubespecialidades
        ? z.array(z.string()).min(1, 'Marque ao menos uma subespecialidade.')
        : z.array(z.string()),
      clientesDaRodada: z.enum(['todos', 'alguns']),
      clientes: z.array(opcao),
      tirar: z.array(z.string()),
      incluir: z.array(opcao),
    })
    .superRefine((v, ctx) => {
      if (eixos.temFrentes && !v.frentesEspecialidade.length && !v.frentesModalidade.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['frentesEspecialidade'],
          message: 'Marque ao menos uma frente.',
        });
      }
      if (v.clientesDaRodada === 'alguns' && !v.clientes.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['clientes'],
          message: 'Escolha ao menos um cliente.',
        });
      }
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

type Frente = FilaDoMomentoDto['porFrente'][number];

/** As frentes da fila de um tipo (a "Sem frente" não se marca). */
export const frentesDoTipo = (fila: FilaDoMomentoDto, tipo: NonNullable<Frente['tipo']>) =>
  fila.porFrente.filter((f): f is Frente & { frenteId: string } => !!f.frenteId && f.tipo === tipo);

const idsDasFrentes = (fila: FilaDoMomentoDto) =>
  fila.porFrente.flatMap((f) => (f.frenteId ? [f.frenteId] : []));

const frentesMarcadas = (v: ValoresDistribuir) => [
  ...v.frentesEspecialidade,
  ...v.frentesModalidade,
];

/** Exames (cada um uma vez) que alguma das frentes pega: a contagem da caixa "Todas as ...". */
export function examesNasFrentes(fila: FilaDoMomentoDto, frenteIds: readonly string[]) {
  return fila.grupos
    .filter((g) => g.frenteIds.some((id) => frenteIds.includes(id)))
    .reduce((s, g) => s + g.exames, 0);
}

/**
 * Tudo marcado (ou o eixo sem opção na tela) = "todos" explícito, com a lista vazia na API; senão,
 * o que foi marcado (vazio = nenhum, que o esquema já recusa).
 */
const recorte = (marcados: readonly string[], todos: readonly string[]) =>
  todos.every((id) => marcados.includes(id))
    ? { todos: true, ids: [] as string[] }
    : { todos: false, ids: [...marcados] };

export function recortesDoFormulario(
  v: ValoresDistribuir,
  fila: FilaDoMomentoDto,
): RecortesRodadaDto {
  const prioridades = fila.prioridades.flatMap((p) =>
    p.prioridadeOperacaoId ? [p.prioridadeOperacaoId] : [],
  );
  const subespecialidades = recorte(
    v.subespecialidadeIds,
    opcoesSubespecialidade(fila).map((o) => o.valor),
  );
  const turnos = recorte(
    v.turnoIds,
    fila.turnos.map((t) => t.turnoId),
  );
  const frentes = recorte(frentesMarcadas(v), idsDasFrentes(fila));
  const prioridadesMarcadas = recorte(v.prioridadeIds, prioridades);
  const todosClientes = v.clientesDaRodada === 'todos';
  return {
    todosTurnos: turnos.todos,
    turnoIds: turnos.ids,
    todasFrentes: frentes.todos,
    frenteIds: frentes.ids,
    todasPrioridades: prioridadesMarcadas.todos,
    prioridadeOperacaoIds: prioridadesMarcadas.ids,
    todosSegmentos: subespecialidades.todos,
    subespecialidadeIds: subespecialidades.ids.filter((id) => id !== SEM_SUBESPECIALIDADE),
    subespecialidadeGeral: subespecialidades.ids.includes(SEM_SUBESPECIALIDADE),
    todosClientes,
    clienteIds: todosClientes ? [] : v.clientes.map((c) => c.valor),
    medicosExcluidos: v.tirar,
    medicosIncluidos: v.incluir.map((m) => m.valor).filter((id) => !v.tirar.includes(id)),
  };
}

/**
 * Quantos exames e médicos a rodada pegaria com os recortes (aproximado: o motor decide, e o
 * paciente não se divide). Os exames somam os grupos da fila, cada exame uma vez, com as mesmas
 * regras do recorte: a frente pega o exame se qualquer frente marcada o pega (o "Sem frente" só
 * sem recorte de frente). Os médicos: os dos turnos marcados, só pelos períodos das frentes
 * marcadas (o de frente de modalidade também, se há frente de especialidade marcada).
 */
export function estimativa(v: ValoresDistribuir, fila: FilaDoMomentoDto) {
  const frentes = frentesMarcadas(v);
  const semRecorteDeFrente = recorte(frentes, idsDasFrentes(fila)).todos;
  const subs = opcoesSubespecialidade(fila).map((o) => o.valor);
  const todasSubs = subs.every((id) => v.subespecialidadeIds.includes(id));
  const exames = fila.grupos
    .filter((g) => semRecorteDeFrente || g.frenteIds.some((id) => frentes.includes(id)))
    .filter(
      (g) => todasSubs || v.subespecialidadeIds.includes(g.segmentoId ?? SEM_SUBESPECIALIDADE),
    )
    .filter((g) => !g.prioridadeOperacaoId || v.prioridadeIds.includes(g.prioridadeOperacaoId))
    .reduce((s, g) => s + g.exames, 0);
  const naFrente = (m: FilaDoMomentoDto['medicosEmTurno'][number]) =>
    semRecorteDeFrente ||
    (m.frenteId !== null && frentes.includes(m.frenteId)) ||
    (m.frente.tipo === 'modalidade' && v.frentesEspecialidade.length > 0);
  const medicos = new Set(
    fila.medicosEmTurno
      .filter((m) => v.turnoIds.includes(m.turnoId) && !v.tirar.includes(m.medicoId) && naFrente(m))
      .map((m) => m.medicoId),
  );
  for (const m of v.incluir) if (!v.tirar.includes(m.valor)) medicos.add(m.valor);
  return { exames, medicos: medicos.size };
}
