import type { EventoAuditoria } from '../../auditoria/auditoria';
import type { Data, TurnoDaAlocacao } from '../domain';

export const ALOCACOES_REPOSITORY = Symbol('ALOCACOES_REPOSITORY');

/** A alocação como fica gravada, com os recortes. A cobertura tem `coberturaDeId`. */
export interface AlocacaoGravada {
  id: string;
  medicoId: string;
  turnoId: string;
  frenteId: string;
  diasSemana: number[];
  semanasDoMes: number[];
  horarioInicio: string;
  horarioFim: string;
  dataInicio: Data;
  dataFim: Data | null;
  produtividade: number | null;
  gratificado: boolean;
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
 * Escritas gravam o registro e os eventos de auditoria na mesma transação.
 */
export interface AlocacoesRepository {
  buscar(id: string): Promise<AlocacaoGravada | null>;
  /** As coberturas do titular. */
  coberturasDe(titularId: string): Promise<AlocacaoGravada[]>;
  turno(id: string): Promise<TurnoParaAlocar | null>;
  medico(id: string): Promise<{ ativo: boolean } | null>;
  /** Os ids pedidos que existem. */
  prioridadesExistentes(ids: string[]): Promise<string[]>;
  subespecialidadesExistentes(ids: string[]): Promise<string[]>;
  ajuste(alocacaoId: string, data: Data): Promise<AjusteGravado | null>;
  ajustesDe(alocacaoIds: string[]): Promise<AjusteGravado[]>;
  /** Grava com o id já definido, os recortes e os eventos. */
  criar(alocacao: AlocacaoGravada, eventos: EventoAuditoria[]): Promise<void>;
  /** Troca os campos e os recortes inteiros. */
  atualizar(alocacao: AlocacaoGravada, eventos: EventoAuditoria[]): Promise<void>;
  /** Remove; coberturas, recortes e ajustes caem em cascata (os eventos deles vêm prontos). */
  remover(id: string, eventos: EventoAuditoria[]): Promise<void>;
  /** Cria ou troca o ajuste do dia (único por alocação e data). */
  salvarAjuste(ajuste: AjusteGravado, eventos: EventoAuditoria[]): Promise<void>;
  removerAjuste(id: string, eventos: EventoAuditoria[]): Promise<void>;
}
