import type { EventoAuditoria } from '../../auditoria/auditoria';
import type { Segmento } from '../../comum/segmentos';
import type { Data, TurnoDaAlocacao, Vigencia } from '../domain';

export const ALOCACOES_REPOSITORY = Symbol('ALOCACOES_REPOSITORY');

/** A alocação como fica gravada, com os recortes. A cobertura tem `coberturaDeId`. */
export interface AlocacaoGravada {
  id: string;
  medicoId: string;
  turnoId: string;
  frenteId: string;
  /** Escala fixa (fim opcional) ou período único; a cobertura e a gratificada são períodos. */
  vigencia: Vigencia;
  diasSemana: number[];
  todasSemanas: boolean;
  semanasDoMes: number[];
  horarioInicio: string;
  horarioFim: string;
  dataInicio: Data;
  dataFim: Data | null;
  produtividade: number | null;
  gratificado: boolean;
  todasPrioridades: boolean;
  todosSegmentos: boolean;
  subespecialidadeGeral: boolean;
  prioridadeIds: string[];
  subespecialidadeIds: string[];
  coberturaDeId: string | null;
  observacoes: string | null;
}

/** O turno para validar a alocação, com as frentes cadastradas nele. */
export interface TurnoParaAlocar extends TurnoDaAlocacao {
  id: string;
  frenteIds: string[];
}

export interface AjusteGravado {
  id: string;
  alocacaoId: string;
  data: Data;
  produtividade: number;
  observacoes: string | null;
}

/**
 * Confere a cobertura contra as outras do titular, lidas na transação com o titular travado.
 * Lança para recusar (ex.: sobreposição).
 */
export type ConferirCoberturas = (outras: AlocacaoGravada[]) => void;

/** Monta os eventos do que a remoção apaga: a alocação, as coberturas e os ajustes delas. */
export type EventosDaRemocao = (
  removidas: AlocacaoGravada[],
  ajustes: AjusteGravado[],
) => EventoAuditoria[];

/**
 * Escritas gravam o registro e os eventos de auditoria na mesma transação.
 */
export interface AlocacoesRepository {
  buscar(id: string): Promise<AlocacaoGravada | null>;
  /** As coberturas do titular. */
  coberturasDe(titularId: string): Promise<AlocacaoGravada[]>;
  turno(id: string): Promise<TurnoParaAlocar | null>;
  medico(id: string): Promise<{ ativo: boolean } | null>;
  /** Os ids pedidos que existem entre as prioridades da operação (o recorte é por elas). */
  prioridadesExistentes(ids: string[]): Promise<string[]>;
  /** Os segmentos pedidos que existem, com as especialidades em que existem. */
  segmentos(ids: string[]): Promise<Segmento[]>;
  /** A especialidade da frente; null na frente de modalidade (ou se a frente não existe). */
  especialidadeDaFrente(frenteId: string): Promise<string | null>;
  ajuste(alocacaoId: string, data: Data): Promise<AjusteGravado | null>;
  ajustesDe(alocacaoIds: string[]): Promise<AjusteGravado[]>;
  /** Grava com o id já definido, os recortes e os eventos. */
  criar(alocacao: AlocacaoGravada, eventos: EventoAuditoria[]): Promise<void>;
  /** Troca os campos e os recortes inteiros. */
  atualizar(alocacao: AlocacaoGravada, eventos: EventoAuditoria[]): Promise<void>;
  /**
   * Cobertura nova ou editada: trava o titular, lê as outras coberturas dele e chama `conferir`
   * antes de gravar, tudo na mesma transação (duas coberturas ao mesmo tempo não se sobrepõem).
   * Titular que sumiu: `EscalaInvalidaError`.
   */
  criarCobertura(
    cobertura: AlocacaoGravada,
    eventos: EventoAuditoria[],
    conferir: ConferirCoberturas,
  ): Promise<void>;
  atualizarCobertura(
    cobertura: AlocacaoGravada,
    eventos: EventoAuditoria[],
    conferir: ConferirCoberturas,
  ): Promise<void>;
  /**
   * Remove; coberturas, recortes e ajustes caem em cascata. Trava a alocação e lê o que vai cair na
   * mesma transação do delete, para cada registro apagado ter o seu evento.
   */
  remover(id: string, eventosDe: EventosDaRemocao): Promise<void>;
  /** Cria ou troca o ajuste do dia (único por alocação e data). */
  salvarAjuste(ajuste: AjusteGravado, eventos: EventoAuditoria[]): Promise<void>;
  removerAjuste(id: string, eventos: EventoAuditoria[]): Promise<void>;
}
