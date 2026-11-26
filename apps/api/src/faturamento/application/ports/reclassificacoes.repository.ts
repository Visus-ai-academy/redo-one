import type { ReclassificacaoFaturamento } from '../../domain/reclassificacao';
import type { Autor } from './competencias.repository';

export const RECLASSIFICACOES_REPOSITORY = Symbol('RECLASSIFICACOES_REPOSITORY');

export type NovaReclassificacao = Omit<ReclassificacaoFaturamento, 'id' | 'vigenciaAte'> & {
  vigenciaDesde: string;
};

/** Tabelas `reclassificacoes_faturamento` e `_recortes` (versões: encerrar e criar outra). */
export interface ReclassificacoesRepository {
  /** Todas as versões. */
  listar(): Promise<ReclassificacaoFaturamento[]>;
  /** Com as prévias das abertas enfileiradas na mesma transação. */
  criar(r: NovaReclassificacao, autor: Autor): Promise<string>;
  /** Só a que ainda vale depois de `ate`; `false` se não achou. Com as prévias na transação. */
  encerrar(id: string, ate: string): Promise<boolean>;
}
