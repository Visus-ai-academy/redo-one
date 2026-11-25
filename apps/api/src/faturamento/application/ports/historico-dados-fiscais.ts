import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';

export const HISTORICO_DADOS_FISCAIS = Symbol('HISTORICO_DADOS_FISCAIS');

/** Entidade dos eventos de auditoria dos dados de faturamento do cliente. */
export const ENTIDADE_DADOS_FISCAIS = 'cliente_dados_fiscais';

/** Uma alteração dos dados de faturamento: quem, quando e os campos antes e depois. */
export interface AlteracaoDadosFiscais {
  id: string;
  clienteId: string;
  ocorridoEm: Date;
  ator: { tipo: 'usuario' | 'robo' | 'sistema'; nome: string | null };
  acao: string;
  /** Só os campos que mudaram. */
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
}

/** Leitura de `eventos_auditoria` dos dados de faturamento de um cliente. */
export interface HistoricoDadosFiscaisRepository {
  /** Do mais novo para o mais antigo. */
  listar(clienteId: string, paginacao: Paginacao): Promise<Pagina<AlteracaoDadosFiscais>>;
}
