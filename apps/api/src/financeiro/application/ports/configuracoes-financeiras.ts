import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import type { ConfiguracaoFinanceira } from '../../domain/configuracao-financeira';

export const CONFIGURACOES_FINANCEIRAS = Symbol('CONFIGURACOES_FINANCEIRAS');

export interface ConfiguracoesFinanceiras {
  /** A configuração gravada da empresa; `null` = a empresa usa o padrão. */
  buscar(contratadoId: string): Promise<ConfiguracaoFinanceira | null>;
  salvar(contratadoId: string, dados: ConfiguracaoFinanceira, porId: string): Promise<void>;
}

export const INADIMPLENCIA = Symbol('INADIMPLENCIA');

export interface FiltroInadimplencia extends Paginacao {
  empresa: 'todas' | { id: string };
  /** O começo (em dias) da faixa de atraso, ou "todas" (escolha explícita). */
  faixa: 'todas' | number;
  /** Parte do nome do cliente. */
  busca?: string;
  /** Dia de hoje em Brasília. */
  hoje: string;
  /** Faixas de quem não gravou as suas. */
  faixasPadrao: readonly number[];
}

/** Um cliente com títulos a receber vencidos numa empresa. */
export interface LinhaInadimplencia {
  clienteId: string;
  clienteNome: string;
  contratadoId: string;
  empresaNome: string;
  titulos: number;
  /** Vencimento do título vencido mais antigo. */
  maisAntigo: string;
  /** Dias de atraso do mais antigo. */
  diasDeAtraso: number;
  /** As faixas da empresa do cliente. */
  faixas: number[];
  totalVencidoCentavos: number;
}

export interface PaginaInadimplencia extends Pagina<LinhaInadimplencia> {
  /** Soma do vencido de tudo que o filtro pega. */
  totalVencidoCentavos: number;
}

export interface Inadimplencia {
  /** Do maior atraso para o menor. */
  listar(filtro: FiltroInadimplencia): Promise<PaginaInadimplencia>;
}
