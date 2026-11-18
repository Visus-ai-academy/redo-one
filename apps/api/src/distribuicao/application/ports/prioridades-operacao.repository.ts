import type {
  CelulaRecebimento,
  PrioridadeOperacao,
} from '../../domain/motor/prioridades-operacao';
import type { EdicaoPrioridadeOperacao } from '../../domain/prioridades-operacao';

export const PRIORIDADES_OPERACAO_REPOSITORY = Symbol('PRIORIDADES_OPERACAO_REPOSITORY');

/** Prioridades da operação (com o de-para) e a grade geral de recebimento. */
export interface PrioridadesOperacaoRepository {
  /** Todas, pela posição e pelo nome (poucas: lista curta e limitada). */
  listar(): Promise<PrioridadeOperacao[]>;
  /** Cria e devolve o id; com `padrao`, tira a marca da que a tinha (mesma transação). */
  criar(edicao: EdicaoPrioridadeOperacao): Promise<string>;
  /** Troca a prioridade e o de-para inteiros; com `padrao`, tira a marca das outras. */
  salvar(prioridade: PrioridadeOperacao): Promise<void>;
  /** Exclui com o de-para, as células e as sobrescritas das frentes. */
  excluir(id: string): Promise<void>;
  obterGrade(): Promise<CelulaRecebimento[]>;
  /** Troca a grade geral inteira. */
  salvarGrade(celulas: readonly CelulaRecebimento[]): Promise<void>;
}
