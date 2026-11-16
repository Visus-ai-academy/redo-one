import { EscalaInvalidaError } from './errors';
import { cabeNoTurno, type FaixaHorario, type Horario, normalizarHorario } from './horario';
import {
  type Data,
  existeDiaNoPeriodo,
  normalizarDiasSemana,
  normalizarSemanasDoMes,
  validarData,
} from './recorrencia';

/** `fixo`: Manhã, Tarde, Plantão. `lista`: a Lista de 24 h, com gratificação. */
export type TipoTurno = 'fixo' | 'lista';

/** O que a validação precisa saber do turno escolhido. */
export interface TurnoDaAlocacao extends FaixaHorario {
  nome: string;
  tipo: TipoTurno;
}

/** Entrada de criação ou edição de uma alocação (sem a cobertura, que tem validação própria). */
export interface DadosAlocacao {
  diasSemana: readonly number[];
  /** Vazio ou ausente = toda semana. */
  semanasDoMes?: readonly number[];
  /** Ausente = o do turno. */
  horarioInicio?: string | null;
  horarioFim?: string | null;
  dataInicio: string;
  /** Ausente ou nulo = escala fixa, sem fim. */
  dataFim?: string | null;
  produtividade?: number | null;
  gratificado?: boolean;
}

export interface AlocacaoValidada {
  diasSemana: number[];
  semanasDoMes: number[];
  horarioInicio: Horario;
  horarioFim: Horario;
  dataInicio: Data;
  dataFim: Data | null;
  produtividade: number | null;
  gratificado: boolean;
}

/**
 * Registros por turno: inteiro ≥ 0, ou nulo = não informado (≠ 0: o robô lê nulo como
 * capacidade desconhecida). O dashboards-one truncava fração (`produtividade` :694-699);
 * aqui recusa.
 */
export function validarProdutividade(valor: number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  if (!Number.isInteger(valor) || valor < 0) {
    throw new EscalaInvalidaError(
      `Produtividade inválida: "${valor}". Use um número inteiro igual ou maior que zero.`,
    );
  }
  return valor;
}

/** Valida o período: datas reais e fim ≥ início. */
export function validarPeriodo(dataInicio: string, dataFim: string | null | undefined) {
  const inicio = validarData(dataInicio);
  const fim = dataFim === null || dataFim === undefined ? null : validarData(dataFim);
  if (fim !== null && fim < inicio) {
    throw new EscalaInvalidaError('Data fim não pode ser anterior à data início.');
  }
  return { dataInicio: inicio, dataFim: fim };
}

/** Horário do vínculo (ausente = o do turno), que precisa caber na caixa do turno. */
export function validarHorarioNoTurno(
  turno: TurnoDaAlocacao,
  horarioInicio: string | null | undefined,
  horarioFim: string | null | undefined,
): FaixaHorario {
  const faixa = {
    horarioInicio: horarioInicio ? normalizarHorario(horarioInicio) : turno.horarioInicio,
    horarioFim: horarioFim ? normalizarHorario(horarioFim) : turno.horarioFim,
  };
  if (!cabeNoTurno(turno, faixa)) {
    throw new EscalaInvalidaError(
      `O horário ${faixa.horarioInicio}–${faixa.horarioFim} não cabe no turno ${turno.nome} ` +
        `(${turno.horarioInicio}–${turno.horarioFim}). Ajuste o horário ou escolha outro turno.`,
    );
  }
  return faixa;
}

/**
 * Valida a criação ou edição de uma alocação e devolve os dados normalizados.
 * Fonte: dashboards-one `escala-hierarquica.ts` `montarAloc` (:701-775), sem status, sem
 * "a cada N dias" e sem recorte de modalidades (decisões do redo-one).
 */
export function validarAlocacao(dados: DadosAlocacao, turno: TurnoDaAlocacao): AlocacaoValidada {
  const diasSemana = normalizarDiasSemana(dados.diasSemana);
  if (diasSemana.length === 0) {
    throw new EscalaInvalidaError('Selecione ao menos um dia da semana.');
  }
  const { dataInicio, dataFim } = validarPeriodo(dados.dataInicio, dados.dataFim);
  const faixa = validarHorarioNoTurno(turno, dados.horarioInicio, dados.horarioFim);
  const produtividade = validarProdutividade(dados.produtividade);
  const gratificado = dados.gratificado === true;

  if (gratificado) {
    // O dashboards-one zerava o gratificado em silêncio fora da Lista; aqui recusa.
    if (turno.tipo !== 'lista') {
      throw new EscalaInvalidaError('Escala gratificada só existe em turno do tipo lista.');
    }
    // Gratificado é pontual: período fechado e cota para ele.
    if (dataFim === null) {
      throw new EscalaInvalidaError('Escala gratificada precisa de data de fim.');
    }
    if (!produtividade) {
      throw new EscalaInvalidaError('Escala gratificada precisa da cota de registros.');
    }
  }
  // Período fechado gratificado não repete por semana do mês.
  const semanasDoMes = gratificado ? [] : normalizarSemanasDoMes(dados.semanasDoMes ?? []);

  if (dataFim !== null && !existeDiaNoPeriodo({ diasSemana, semanasDoMes, dataInicio, dataFim })) {
    throw new EscalaInvalidaError('Nenhum dia marcado cai no período.');
  }

  return { diasSemana, semanasDoMes, ...faixa, dataInicio, dataFim, produtividade, gratificado };
}

/**
 * - `fixa`: sem fim, repete para sempre.
 * - `periodo_unico`: com fim; no mesmo médico, turno e frente substitui a fixa nos dias dele.
 * - `gratificada`: período fechado com cota, só em turno lista.
 * - `cobertura`: outro médico assume o vínculo do titular no período.
 */
export type ClassificacaoAlocacao = 'fixa' | 'periodo_unico' | 'gratificada' | 'cobertura';

export function classificarAlocacao(alocacao: {
  dataFim: Data | null;
  gratificado: boolean;
  coberturaDeId: string | null;
}): ClassificacaoAlocacao {
  if (alocacao.coberturaDeId !== null) return 'cobertura';
  if (alocacao.gratificado) return 'gratificada';
  return alocacao.dataFim === null ? 'fixa' : 'periodo_unico';
}
