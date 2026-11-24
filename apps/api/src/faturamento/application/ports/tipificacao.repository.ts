import type {
  ConfiguracaoCliente,
  ConfiguracaoTipificacao,
  LaudoParaTipificar,
} from '../../domain/tipificacao';
import type { Autor } from './competencias.repository';

export const TIPIFICACAO_REPOSITORY = Symbol('TIPIFICACAO_REPOSITORY');

export interface DadosRegra {
  nome: string;
  descricao: string | null;
  cor: string | null;
  faturaSemSubregra: boolean;
  ativo: boolean;
}

export interface RegraRegistrada extends DadosRegra {
  id: string;
  ordem: number;
  padrao: boolean;
  /** Clientes e unidades com esta regra principal. */
  clientes: number;
}

export interface DadosSubregra {
  regraId: string;
  nome: string;
  descricao: string | null;
  fatura: boolean;
  ativo: boolean;
}

export interface SubregraRegistrada extends DadosSubregra {
  id: string;
  ordem: number;
  /** Clientes e unidades que usam a sub-regra numa linha ou no "todos os demais". */
  clientes: number;
}

/** O cliente da configuração: a unidade aponta o principal. */
export interface ClienteDaTipificacao {
  id: string;
  nome: string;
  unificadoEmId: string | null;
  principalNome: string | null;
}

export interface ConfiguracaoRegistrada extends ConfiguracaoCliente {
  atualizadoEm: Date;
  /** Nome de quem salvou; nulo na carga do dashboards-one. */
  atualizadoPor: string | null;
}

/** O que a prévia lê de cada laudo (não removido). */
export interface LaudoParaPreviaTipificacao extends LaudoParaTipificar {
  id: string;
  competencia: string;
  volume: number;
}

export interface LotePreviaTipificacao {
  /** Laudos do principal (`laudos.cliente_id`). */
  clienteId: string;
  /** Só os desta unidade de origem; nulo = todos os do principal. */
  unidadeId: string | null;
  competenciasBloqueadas: string[];
  depoisDe: string | null;
  limite: number;
}

export interface Opcao {
  id: string;
  nome: string;
  cor: string | null;
}

/** Listas que o editor da configuração usa (os cadastros do catálogo e as equipes, ativos). */
export interface OpcoesTipificacao {
  modalidades: Opcao[];
  especialidades: Opcao[];
  prioridades: Opcao[];
}

/** Tabelas da tipificação (`faturamento`) e a leitura dos laudos para a prévia. */
export interface TipificacaoRepository {
  /** Regras, sub-regras e clientes (sem os membros das equipes); nulo sem regra cadastrada. */
  carregarConfiguracao(): Promise<Omit<ConfiguracaoTipificacao, 'equipes'> | null>;
  listarRegras(): Promise<RegraRegistrada[]>;
  listarSubregras(): Promise<SubregraRegistrada[]>;
  /** Id da regra ou sub-regra com o nome (sem diferenciar maiúsculas), para recusar repetido. */
  regraComNome(nome: string): Promise<string | null>;
  subregraComNome(nome: string): Promise<string | null>;
  /** Cria ou atualiza; a mudança enfileira a reclassificação de todos na mesma transação. */
  salvarRegra(id: string | null, dados: DadosRegra): Promise<string>;
  salvarSubregra(id: string | null, dados: DadosSubregra): Promise<string>;
  obterCliente(clienteId: string): Promise<ClienteDaTipificacao | null>;
  obterConfiguracaoCliente(clienteId: string): Promise<ConfiguracaoRegistrada | null>;
  /**
   * Troca a configuração inteira (nula = apaga: segue a do principal ou a padrão) e enfileira a
   * reclassificação dos laudos do principal, na mesma transação.
   */
  salvarConfiguracaoCliente(
    clienteId: string,
    configuracao: Omit<ConfiguracaoCliente, 'clienteId'> | null,
    principalId: string,
    autor: Autor,
  ): Promise<void>;
  lerParaPrevia(lote: LotePreviaTipificacao): Promise<LaudoParaPreviaTipificacao[]>;
  listarOpcoes(): Promise<OpcoesTipificacao>;
}
