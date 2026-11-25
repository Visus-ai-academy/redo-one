import { validarProdutividade } from './alocacao';
import { EscalaInvalidaError } from './errors';
import type { FaixaHorario } from './horario';
import { adicionarDias, type Data, normalizarDiasSemana, validarData } from './recorrencia';

/**
 * "Montar escala do médico": a grade turnos × dias da semana de UM médico numa frente, cada célula
 * com a produtividade (nula = não informada). Ao salvar, os dias do mesmo turno com a mesma
 * produtividade viram uma alocação fixa só.
 * Fonte: dashboards-one `escala-hierarquica.ts` `salvarEscalaDoMedico` (:1150-1246), que comparava
 * por turno e frente; aqui a comparação é por grupo (turno + produtividade + dias).
 */
export interface CelulaEscalaFixa {
  turnoId: string;
  /** 0 = domingo … 6 = sábado. */
  diaSemana: number;
  produtividade: number | null;
}

/** Uma alocação fixa que a grade monta: o turno, a produtividade e os dias dela. */
export interface GrupoEscalaFixa {
  turnoId: string;
  produtividade: number | null;
  diasSemana: number[];
}

/** O que o plano lê de cada alocação fixa atual que está na grade. */
export interface AlocacaoDaGrade extends GrupoEscalaFixa {
  id: string;
  dataInicio: Data;
}

export interface PlanoEscalaFixa {
  /** Ids que ficam como estão. */
  manter: string[];
  criar: GrupoEscalaFixa[];
  /** Começaram antes do "a partir de": terminam na véspera. */
  encerrar: { id: string; dataFim: Data }[];
  /** Começam no "a partir de" ou depois: saem. */
  remover: string[];
}

/** O que decide se uma alocação fixa entra na grade. */
export interface AlocacaoCandidata extends FaixaHorario {
  dataFim: Data | null;
  coberturaDeId: string | null;
  gratificado: boolean;
  todasSemanas: boolean;
  todasPrioridades: boolean;
  todosSegmentos: boolean;
}

/**
 * A alocação cabe na grade quando é fixa (sem fim), não é cobertura nem gratificada, repete toda
 * semana, usa o horário do turno e não tem recorte. As outras ("fora da grade") continuam valendo
 * e se editam pelo formulário da alocação; a grade não as toca.
 */
export function ehAlocacaoDaGrade(alocacao: AlocacaoCandidata, turno: FaixaHorario): boolean {
  return (
    alocacao.dataFim === null &&
    alocacao.coberturaDeId === null &&
    !alocacao.gratificado &&
    alocacao.todasSemanas &&
    alocacao.horarioInicio === turno.horarioInicio &&
    alocacao.horarioFim === turno.horarioFim &&
    alocacao.todasPrioridades &&
    alocacao.todosSegmentos
  );
}

const chaveCelula = (c: { turnoId: string; diaSemana: number }) => `${c.turnoId}|${c.diaSemana}`;

/** Dia de 0 a 6, produtividade inteira ≥ 0 ou nula, e cada turno + dia uma vez só. */
export function validarCelulas(celulas: readonly CelulaEscalaFixa[]): void {
  const vistas = new Set<string>();
  for (const celula of celulas) {
    normalizarDiasSemana([celula.diaSemana]);
    validarProdutividade(celula.produtividade);
    const chave = chaveCelula(celula);
    if (vistas.has(chave)) {
      throw new EscalaInvalidaError(
        'Célula repetida na grade: cada turno e dia da semana aparece uma vez só.',
      );
    }
    vistas.add(chave);
  }
}

/** Junta os dias do mesmo turno com a mesma produtividade, na ordem em que aparecem. */
export function agruparCelulas(celulas: readonly CelulaEscalaFixa[]): GrupoEscalaFixa[] {
  const grupos = new Map<string, GrupoEscalaFixa>();
  for (const c of celulas) {
    const chave = `${c.turnoId}|${c.produtividade ?? 'nula'}`;
    const grupo = grupos.get(chave) ?? {
      turnoId: c.turnoId,
      produtividade: c.produtividade,
      diasSemana: [],
    };
    grupo.diasSemana.push(c.diaSemana);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()].map((g) => ({
    ...g,
    diasSemana: normalizarDiasSemana(g.diasSemana),
  }));
}

/** As células das alocações da grade; se duas caem no mesmo turno + dia, vale a primeira. */
export function celulasDaGrade(alocacoes: readonly GrupoEscalaFixa[]): CelulaEscalaFixa[] {
  const celulas = new Map<string, CelulaEscalaFixa>();
  for (const a of alocacoes) {
    for (const diaSemana of a.diasSemana) {
      const celula = { turnoId: a.turnoId, diaSemana, produtividade: a.produtividade };
      if (!celulas.has(chaveCelula(celula))) celulas.set(chaveCelula(celula), celula);
    }
  }
  return [...celulas.values()];
}

const chaveGrupo = (g: GrupoEscalaFixa) =>
  `${g.turnoId}|${g.produtividade ?? 'nula'}|${normalizarDiasSemana(g.diasSemana).join(',')}`;

/**
 * Compara a grade com as alocações da grade atuais. Grupo igual (turno, produtividade e dias)
 * fica; atual que não bate sai (encerrada na véspera do `aPartirDe` se começou antes, removida se
 * não); grupo sem par vira alocação nova a partir de `aPartirDe`.
 */
export function planejarEscalaFixa(
  atuais: readonly AlocacaoDaGrade[],
  celulas: readonly CelulaEscalaFixa[],
  aPartirDe: string,
): PlanoEscalaFixa {
  const inicio = validarData(aPartirDe);
  validarCelulas(celulas);
  const disponiveis = [...atuais];
  const plano: PlanoEscalaFixa = { manter: [], criar: [], encerrar: [], remover: [] };
  for (const grupo of agruparCelulas(celulas)) {
    const i = disponiveis.findIndex((a) => chaveGrupo(a) === chaveGrupo(grupo));
    const par = i >= 0 ? disponiveis.splice(i, 1)[0] : undefined;
    if (par) plano.manter.push(par.id);
    else plano.criar.push(grupo);
  }
  const vespera = adicionarDias(inicio, -1);
  for (const a of disponiveis) {
    if (a.dataInicio >= inicio) plano.remover.push(a.id);
    else plano.encerrar.push({ id: a.id, dataFim: vespera });
  }
  // A ordem das atuais é a de quem chamou: `manter` sai nessa ordem.
  const ordem = new Map(atuais.map((a, i) => [a.id, i]));
  plano.manter.sort((x, y) => (ordem.get(x) ?? 0) - (ordem.get(y) ?? 0));
  return plano;
}
