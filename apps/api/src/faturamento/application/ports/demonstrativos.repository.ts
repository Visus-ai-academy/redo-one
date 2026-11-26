import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import type { Demonstrativo, ItemDemonstrativo } from '../../domain/demonstrativo';

export const DEMONSTRATIVOS_REPOSITORY = Symbol('DEMONSTRATIVOS_REPOSITORY');

export type OrigemDemonstrativo = 'previa' | 'fechamento' | 'recalculo';

export interface GravacaoDemonstrativos {
  competencia: string;
  origem: OrigemDemonstrativo;
  recalculoId: string | null;
  geradoEm: Date;
  demonstrativos: readonly Demonstrativo[];
}

export interface ResumoDemonstrativo {
  id: string;
  competencia: string;
  clienteId: string;
  cliente: string;
  versao: number;
  vigente: boolean;
  origem: OrigemDemonstrativo;
  recalculoId: string | null;
  laudos: number;
  quantidade: number;
  valorCentavos: number;
  quantidadeSemPreco: number;
  nadaAFaturar: boolean;
  geradoEm: Date;
}

export interface ItemComNomes extends ItemDemonstrativo {
  nomes: {
    membro: string;
    modalidade: string;
    especialidade: string;
    categoria: string;
    prioridade: string;
  };
}

export interface DemonstrativoDetalhado extends ResumoDemonstrativo {
  itens: ItemComNomes[];
}

export interface TotaisCompetencia {
  clientes: number;
  laudos: number;
  quantidade: number;
  valorCentavos: number;
  quantidadeSemPreco: number;
}

/** Tabelas `demonstrativos_faturamento` e `_itens`. */
export interface DemonstrativosRepository {
  /**
   * Grava os demonstrativos da competência numa transação. `previa`: substitui as prévias (só na
   * aberta; recusa e não grava nada se ela foi fechada no meio). `fechamento` e `recalculo`: versão
   * nova de cada cliente, a anterior deixa de ser vigente e fica guardada; a prévia sai.
   */
  gravar(g: GravacaoDemonstrativos): Promise<boolean>;
  /** Os vigentes da competência, pelo nome do cliente. */
  listar(competencia: string, paginacao: Paginacao): Promise<Pagina<ResumoDemonstrativo>>;
  totais(competencia: string): Promise<TotaisCompetencia>;
  /** O vigente do cliente (ou a versão pedida), com os itens. */
  obter(
    competencia: string,
    clienteId: string,
    versao?: number,
  ): Promise<DemonstrativoDetalhado | null>;
  /** Todas as versões do cliente na competência, a mais nova primeiro. */
  versoes(competencia: string, clienteId: string): Promise<ResumoDemonstrativo[]>;
}
