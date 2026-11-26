import type { Autor } from './competencias.repository';

export const AJUSTES_LAUDO_REPOSITORY = Symbol('AJUSTES_LAUDO_REPOSITORY');

export type TipoAjusteLaudo = 'valor' | 'excluir';

export interface AjusteLaudo {
  id: string;
  laudoIdentidade: string;
  laudoId: string | null;
  competencia: string;
  clienteId: string | null;
  tipo: TipoAjusteLaudo;
  valorUnitarioCentavos: number | null;
  motivo: string;
  criadoEm: Date;
  criadoPorId: string;
  criadoPor: string | null;
  encerradoEm: Date | null;
  encerradoPorId: string | null;
  encerradoPor: string | null;
  motivoEncerramento: string | null;
}

/** O que o ajuste precisa saber do laudo. */
export interface LaudoDoAjuste {
  id: string;
  identidade: string;
  competencia: string;
  clienteId: string | null;
}

export interface NovoAjusteLaudo {
  laudo: LaudoDoAjuste;
  tipo: TipoAjusteLaudo;
  valorUnitarioCentavos: number | null;
  motivo: string;
}

/** Tabela `ajustes_laudo_faturamento` (nada se apaga; encerrar fica no histórico). */
export interface AjustesLaudoRepository {
  obterLaudo(laudoId: string): Promise<LaudoDoAjuste | null>;
  /** O vigente do laudo, se houver. */
  vigente(laudoIdentidade: string): Promise<AjusteLaudo | null>;
  obter(id: string): Promise<AjusteLaudo | null>;
  /**
   * Grava o novo, encerrando o vigente do laudo (com o motivo de troca) na mesma transação, e
   * enfileira as prévias quando a competência está aberta.
   */
  criar(novo: NovoAjusteLaudo, autor: Autor, motivoTroca: string | null): Promise<string>;
  /** Só se ainda vigente; `false` se outro já encerrou. */
  encerrar(id: string, motivo: string, autor: Autor): Promise<boolean>;
  /** Todos (vigentes e encerrados) da competência, o mais novo primeiro. */
  listar(competencia: string): Promise<AjusteLaudo[]>;
}
