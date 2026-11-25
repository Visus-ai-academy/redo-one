import type { ExcecaoRecebimento } from '../../domain/motor/prioridades-operacao';

export const EXCECOES_RECEBIMENTO_REPOSITORY = Symbol('EXCECOES_RECEBIMENTO_REPOSITORY');

export type ExcecaoRecebimentoGravavel = Omit<ExcecaoRecebimento, 'criadoEm'>;

/** Exceções temporárias da grade de recebimento. */
export interface ExcecoesRecebimentoRepository {
  /**
   * Todas, da que começa por último para a primeira. Lista curta e limitada (poucas por mês),
   * que a tela recolhe nas encerradas.
   */
  listar(): Promise<ExcecaoRecebimento[]>;
  /** As que terminam no dia ou depois (as que podem valer numa rodada desse dia). */
  terminandoDesde(dia: string): Promise<ExcecaoRecebimento[]>;
  obter(id: string): Promise<ExcecaoRecebimento | null>;
  criar(excecao: Omit<ExcecaoRecebimento, 'id'>): Promise<string>;
  salvar(excecao: ExcecaoRecebimentoGravavel): Promise<void>;
  excluir(id: string): Promise<void>;
}
