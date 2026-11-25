import { validarPeriodo } from './alocacao';
import {
  AcaoProibidaEscalaError,
  EscalaInvalidaError,
  RegistroEscalaNaoEncontradoError,
} from './errors';
import { type Data, diaDaSemana, existeDiaNoPeriodo, normalizarDiasSemana } from './recorrencia';

export type SituacaoAusencia = 'pendente' | 'aprovada' | 'recusada';
export type OrigemAusencia = 'gestor' | 'medico';

/** Tipo de ausência (cadastro): a gravidade desempata ausências no mesmo dia. */
export interface TipoAusencia {
  id: string;
  gravidade: number;
}

export interface DadosAusencia {
  dataInicio: string;
  dataFim: string;
  /** Vale todos os dias do período. Sem ele, `diasSemana` precisa de ao menos um. */
  todosDias: boolean;
  /** 0 = domingo … 6 = sábado, sem `todosDias`. */
  diasSemana?: readonly number[];
  /** Vale todas as frentes. Sem ele, `frenteIds` precisa de ao menos uma. */
  todasFrentes: boolean;
  frenteIds?: readonly string[];
  /** Vale o dia inteiro (todos os turnos). Sem ele, `turnoIds` precisa de ao menos um. */
  todosTurnos: boolean;
  turnoIds?: readonly string[];
  origem: OrigemAusencia;
  tipo: { soGestor: boolean };
  observacoes?: string | null;
}

export interface AusenciaValidada {
  dataInicio: Data;
  dataFim: Data;
  todosDias: boolean;
  todasFrentes: boolean;
  todosTurnos: boolean;
  diasSemana: number[];
  frenteIds: string[];
  turnoIds: string[];
  situacao: SituacaoAusencia;
}

/**
 * Vazio nunca é "todos" (25/11/2026): ou "todos", ou ao menos um item; as duas coisas, erro.
 */
function exigirRecorte(
  todos: boolean,
  itens: readonly unknown[],
  oQue: string,
  todosRotulo: string,
) {
  if (todos && itens.length) {
    throw new EscalaInvalidaError(
      `Ausência: escolha "${todosRotulo}" ou marque os itens, não as duas coisas.`,
    );
  }
  if (!todos && !itens.length) {
    throw new EscalaInvalidaError(`Ausência: marque ${oQue} (ou "${todosRotulo}").`);
  }
}

/** Tamanho mínimo do motivo que o médico escreve no pedido (dashboards-one `solicitarAusencia`). */
const MOTIVO_MINIMO = 3;

/**
 * Valida a ausência. A do gestor nasce aprovada; a do médico nasce pendente (não tira ninguém da
 * escala até o gestor aprovar), exige motivo e não pode ser de tipo que só o gestor lança.
 * Fontes: dashboards-one `escala-hierarquica.ts` `validarAusencia`/`diasAusencia` (:1701-1730) e
 * `portalMedico.ts` `solicitarAusencia` (:400-423).
 */
export function validarAusencia(dados: DadosAusencia): AusenciaValidada {
  const { dataInicio, dataFim } = validarPeriodo(dados.dataInicio, dados.dataFim);
  const doMedico = dados.origem === 'medico';
  if (doMedico && dados.tipo.soGestor) {
    throw new AcaoProibidaEscalaError('Este tipo de ausência só o gestor lança.');
  }
  if (doMedico && (dados.observacoes ?? '').trim().length < MOTIVO_MINIMO) {
    throw new EscalaInvalidaError('Descreva o motivo da ausência.');
  }
  const diasSemana = normalizarDiasSemana(dados.diasSemana ?? []);
  const frenteIds = [...new Set(dados.frenteIds ?? [])];
  const turnoIds = [...new Set(dados.turnoIds ?? [])];
  exigirRecorte(dados.todosDias, diasSemana, 'ao menos um dia', 'todos os dias');
  exigirRecorte(dados.todasFrentes, frenteIds, 'ao menos uma escala', 'todas');
  exigirRecorte(dados.todosTurnos, turnoIds, 'ao menos um turno', 'o dia inteiro');
  // Ausência em dias que não existem no período ficaria registrada sem tirar o médico de nada.
  if (
    !dados.todosDias &&
    !existeDiaNoPeriodo({
      diasSemana,
      todasSemanas: true,
      semanasDoMes: [],
      dataInicio,
      dataFim: dataFim as Data,
    })
  ) {
    throw new EscalaInvalidaError('Nenhum dos dias da semana escolhidos cai no período.');
  }
  return {
    dataInicio,
    dataFim: dataFim as Data,
    todosDias: dados.todosDias,
    todasFrentes: dados.todasFrentes,
    todosTurnos: dados.todosTurnos,
    diasSemana,
    frenteIds,
    turnoIds,
    situacao: doMedico ? 'pendente' : 'aprovada',
  };
}

/** Ausência como a expansão da escala a lê. */
export interface AusenciaEscala {
  id: string;
  medicoId: string;
  tipoId: string;
  dataInicio: Data;
  dataFim: Data;
  todosDias: boolean;
  todasFrentes: boolean;
  /** O dia inteiro. */
  todosTurnos: boolean;
  diasSemana: readonly number[];
  frenteIds: readonly string[];
  turnoIds: readonly string[];
  situacao: SituacaoAusencia;
}

/**
 * A ausência tira o médico desta ocorrência? Só a aprovada; cada recorte vale com o "todos"
 * explícito ou com o item na lista (lista vazia sem "todos" não casa nada). Fonte: dashboards-one `escala-hierarquica.ts` `ausenciaNoDia` (:1468-1484).
 */
export function aplicaNaOcorrencia(
  ausencia: AusenciaEscala,
  ocorrencia: { medicoId: string; data: Data; frenteId: string; turnoId: string },
): boolean {
  const recorte = <T>(todos: boolean, lista: readonly T[], valor: T) =>
    todos || lista.includes(valor);
  return (
    ausencia.situacao === 'aprovada' &&
    ausencia.medicoId === ocorrencia.medicoId &&
    ocorrencia.data >= ausencia.dataInicio &&
    ocorrencia.data <= ausencia.dataFim &&
    recorte(ausencia.todosDias, ausencia.diasSemana, diaDaSemana(ocorrencia.data)) &&
    recorte(ausencia.todasFrentes, ausencia.frenteIds, ocorrencia.frenteId) &&
    recorte(ausencia.todosTurnos, ausencia.turnoIds, ocorrencia.turnoId)
  );
}

export interface Revisor {
  usuarioId: string;
  em: Date;
}

export interface RevisaoAusencia {
  situacao: SituacaoAusencia;
  motivoRecusa: string | null;
  revisadaPorId: string;
  revisadaEm: Date;
}

function exigirPendente(ausencia: { situacao: SituacaoAusencia }) {
  if (ausencia.situacao !== 'pendente') {
    throw new EscalaInvalidaError('Esta solicitação já foi revisada.');
  }
}

/**
 * Aprova a solicitação pendente. O dashboards-one (`aprovarAusencia` :1854) aprovava em qualquer
 * situação, inclusive uma recusada; aqui só a pendente.
 */
export function aprovarAusencia(
  ausencia: { situacao: SituacaoAusencia },
  revisor: Revisor,
): RevisaoAusencia {
  exigirPendente(ausencia);
  return {
    situacao: 'aprovada',
    motivoRecusa: null,
    revisadaPorId: revisor.usuarioId,
    revisadaEm: revisor.em,
  };
}

/** Recusa a solicitação pendente com um motivo, que o médico vê no portal. */
export function recusarAusencia(
  ausencia: { situacao: SituacaoAusencia },
  motivo: string,
  revisor: Revisor,
): RevisaoAusencia {
  exigirPendente(ausencia);
  const texto = motivo.trim();
  if (!texto) throw new EscalaInvalidaError('Informe o motivo da recusa.');
  return {
    situacao: 'recusada',
    motivoRecusa: texto,
    revisadaPorId: revisor.usuarioId,
    revisadaEm: revisor.em,
  };
}

/**
 * O médico cancela o próprio pedido, só enquanto pendente: depois de aprovada, mexer na ausência
 * é decisão do gestor. Fonte: dashboards-one `portalMedico.ts` `cancelarSolicitacao` (:466-481).
 */
export function cancelarSolicitacao(
  ausencia: { situacao: SituacaoAusencia; origem: OrigemAusencia; medicoId: string },
  medicoId: string,
): void {
  if (ausencia.medicoId !== medicoId) {
    throw new RegistroEscalaNaoEncontradoError('Solicitação não encontrada.');
  }
  if (ausencia.origem !== 'medico') {
    throw new AcaoProibidaEscalaError('Ausência lançada pelo gestor só o gestor altera.');
  }
  if (ausencia.situacao !== 'pendente') {
    throw new EscalaInvalidaError('Só dá para cancelar uma solicitação pendente.');
  }
}
