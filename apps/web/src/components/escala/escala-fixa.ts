// Grade da escala fixa de um médico numa frente: turnos × dias da semana, com a produtividade.
import type { CelulaEscalaFixaDto } from '../../gen/types/CelulaEscalaFixaDto';
import type { ResultadoEscalaFixaDto } from '../../gen/types/ResultadoEscalaFixaDto';

/** Colunas da grade: segunda a domingo (0 = domingo … 6 = sábado). */
export const DIAS_DA_GRADE = [1, 2, 3, 4, 5, 6, 0] as const;
const DIAS_UTEIS = [1, 2, 3, 4, 5] as const;
const NOMES_MINUSCULOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
/** Posição do dia na grade (segunda primeiro). */
const posicao = (dia: number) => (dia + 6) % 7;

export type CelulaGrade = { marcada: boolean; produtividade: number | null };
/** Células por `turnoId|diaSemana`; a que falta está desmarcada e sem produtividade. */
export type Grade = Readonly<Record<string, CelulaGrade>>;

export const CELULA_VAZIA: CelulaGrade = { marcada: false, produtividade: null };

const chave = (turnoId: string, dia: number) => `${turnoId}|${dia}`;

type TurnoComFrentes = { id: string; nome: string; ordem: number; frentes: { id: string }[] };

/** Só as frentes que algum turno tem: sem turno, a grade não teria linha. */
export function frentesComTurno<F extends { id: string }>(
  frentes: readonly F[],
  turnos: readonly TurnoComFrentes[],
): F[] {
  const usadas = new Set(turnos.flatMap((t) => t.frentes.map((f) => f.id)));
  return frentes.filter((f) => usadas.has(f.id));
}

/** Linhas da grade: os turnos que têm a frente, em ordem. */
export function turnosDaFrente<T extends TurnoComFrentes>(
  turnos: readonly T[],
  frenteId: string,
): T[] {
  return turnos
    .filter((t) => t.frentes.some((f) => f.id === frenteId))
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
}

export function gradeDasCelulas(celulas: readonly CelulaEscalaFixaDto[]): Grade {
  return Object.fromEntries(
    celulas.map((c) => [
      chave(c.turnoId, c.diaSemana),
      { marcada: true, produtividade: c.produtividade },
    ]),
  );
}

export function celula(grade: Grade, turnoId: string, dia: number): CelulaGrade {
  return grade[chave(turnoId, dia)] ?? CELULA_VAZIA;
}

/** As células marcadas, para a API (por turno e dia, segunda primeiro). */
export function celulasDaGrade(grade: Grade): CelulaEscalaFixaDto[] {
  return Object.entries(grade)
    .filter(([, c]) => c.marcada)
    .map(([k, c]) => {
      const [turnoId = '', dia = '0'] = k.split('|');
      return { turnoId, diaSemana: Number(dia), produtividade: c.produtividade };
    })
    .sort(
      (a, b) => a.turnoId.localeCompare(b.turnoId) || posicao(a.diaSemana) - posicao(b.diaSemana),
    );
}

export function marcar(grade: Grade, turnoId: string, dia: number, marcada: boolean): Grade {
  return { ...grade, [chave(turnoId, dia)]: { ...celula(grade, turnoId, dia), marcada } };
}

export function mudarProdutividade(
  grade: Grade,
  turnoId: string,
  dia: number,
  produtividade: number | null,
): Grade {
  return { ...grade, [chave(turnoId, dia)]: { ...celula(grade, turnoId, dia), produtividade } };
}

/** A produtividade da primeira célula marcada da linha vai para as outras marcadas. */
export function mesmaProdutividadeNaLinha(grade: Grade, turnoId: string): Grade {
  const marcadas = DIAS_DA_GRADE.filter((d) => celula(grade, turnoId, d).marcada);
  const [primeira] = marcadas;
  if (primeira === undefined) return grade;
  const valor = celula(grade, turnoId, primeira).produtividade;
  return marcadas.reduce((g, d) => mudarProdutividade(g, turnoId, d, valor), grade);
}

/** Marca segunda a sexta na linha; se já estão todos marcados, desmarca. */
export function alternarDiasUteis(grade: Grade, turnoId: string): Grade {
  const todos = DIAS_UTEIS.every((d) => celula(grade, turnoId, d).marcada);
  return DIAS_UTEIS.reduce((g, d) => marcar(g, turnoId, d, !todos), grade);
}

export type ItemPrevia = { chave: string; texto: string };

/**
 * O que a grade vira na API: uma alocação por turno e produtividade igual, com os dias juntos
 * ("Manhã · seg, sex · 30"). Em ordem de turno e do primeiro dia.
 */
export function previa(
  celulas: readonly CelulaEscalaFixaDto[],
  turnos: readonly { id: string; nome: string; ordem: number }[],
): ItemPrevia[] {
  const grupos = new Map<
    string,
    { turnoId: string; produtividade: number | null; dias: number[] }
  >();
  for (const c of celulas) {
    const k = `${c.turnoId}|${c.produtividade ?? ''}`;
    const grupo = grupos.get(k) ?? { turnoId: c.turnoId, produtividade: c.produtividade, dias: [] };
    grupo.dias.push(c.diaSemana);
    grupos.set(k, grupo);
  }
  const ordemDoTurno = (id: string) => turnos.find((t) => t.id === id)?.ordem ?? Infinity;
  return [...grupos.entries()]
    .map(([k, g]) => ({ k, ...g, dias: g.dias.sort((a, b) => posicao(a) - posicao(b)) }))
    .sort(
      (a, b) =>
        ordemDoTurno(a.turnoId) - ordemDoTurno(b.turnoId) ||
        a.turnoId.localeCompare(b.turnoId) ||
        posicao(a.dias[0] ?? 0) - posicao(b.dias[0] ?? 0),
    )
    .map((g) => {
      const nome = turnos.find((t) => t.id === g.turnoId)?.nome ?? 'Turno fora da lista';
      const dias = g.dias.map((d) => NOMES_MINUSCULOS[d]).join(', ');
      const produtividade = g.produtividade ?? 'produtividade não informada';
      return { chave: g.k, texto: `${nome} · ${dias} · ${produtividade}` };
    });
}

/** O toast depois de salvar ("3 alocações criadas, 2 encerradas."). */
export function resumoDoResultado(r: ResultadoEscalaFixaDto): string {
  const partes = (
    [
      [r.criadas, 'criada', 'criadas'],
      [r.encerradas, 'encerrada', 'encerradas'],
      [r.removidas, 'removida', 'removidas'],
    ] as const
  ).filter(([n]) => n > 0);
  if (partes.length === 0) return 'Nada mudou na escala.';
  const textos = partes.map(([n, um, varios], i) => {
    const verbo = n === 1 ? um : varios;
    if (i > 0) return `${n} ${verbo}`;
    return `${n} ${n === 1 ? 'alocação' : 'alocações'} ${verbo}`;
  });
  return `${textos.join(', ')}.`;
}
