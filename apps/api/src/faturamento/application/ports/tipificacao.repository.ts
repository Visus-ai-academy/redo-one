import type { EventoAuditoria } from '../../../auditoria/auditoria';
import type {
  ConfiguracaoCliente,
  ConfiguracaoTipificacaoVersionada,
  LaudoParaTipificar,
} from '../../domain/tipificacao';
import type { MudancaVersao, VersaoVigente } from '../../domain/versoes-tipificacao';

export const TIPIFICACAO_REPOSITORY = Symbol('TIPIFICACAO_REPOSITORY');

/** A configuração do cliente ou unidade (regra principal, "todos os demais" e linhas). */
export type Configuracao = Omit<ConfiguracaoCliente, 'clienteId'>;

/** O que não muda o cálculo (só auditoria): nome, descrição, cor e situação. */
export interface DadosRegra {
  nome: string;
  descricao: string | null;
  cor: string | null;
  ativo: boolean;
}

export interface RegraRegistrada extends DadosRegra {
  id: string;
  ordem: number;
  padrao: boolean;
  /** Versões do "fatura sem sub-regra". */
  fatura: VersaoVigente<boolean>[];
  /** Clientes e unidades com esta regra principal (na versão em vigor ou programada). */
  clientes: number;
}

export interface DadosSubregra {
  regraId: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
}

export interface SubregraRegistrada extends DadosSubregra {
  id: string;
  ordem: number;
  /** Versões do "fatura". */
  fatura: VersaoVigente<boolean>[];
  /** Clientes e unidades que usam a sub-regra numa linha ou no "todos os demais" (em vigor ou programada). */
  clientes: number;
}

/** O cliente da configuração: a unidade aponta o principal. */
export interface ClienteDaTipificacao {
  id: string;
  nome: string;
  unificadoEmId: string | null;
  principalNome: string | null;
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

/** De quem é a versão do "fatura". */
export interface DonoFatura {
  tipo: 'regra' | 'subregra';
  id: string;
}

/** A mudança como é gravada: a versão nova já com o id (para o evento de auditoria). */
export type MudancaGravada<T> =
  | Exclude<MudancaVersao<T>, { tipo: 'criar' }>
  | (Extract<MudancaVersao<T>, { tipo: 'criar' }> & { id: string });

export interface OpcoesAplicar {
  usuarioId: string;
  /** Primeira competência que a mudança alcança. */
  aPartirDe: string;
  eventos: EventoAuditoria[];
}

/** Quem fez o quê numa versão, dos eventos de auditoria. */
export interface EventoVersao {
  acao: string;
  /** Nome do usuário; nulo quando veio da carga do dashboards-one. */
  quem: string | null;
  em: Date;
}

/** Versão inicial do "fatura" de uma regra ou sub-regra nova. */
export interface FaturaInicial {
  id: string;
  vigenciaDesde: string;
  valor: boolean;
  usuarioId: string;
}

/** Tabelas da tipificação (`faturamento`) e a leitura dos laudos para a prévia. */
export interface TipificacaoRepository {
  /** Regras, sub-regras e versões dos clientes (sem os membros das equipes); nulo sem regra cadastrada. */
  carregarConfiguracao(): Promise<Omit<ConfiguracaoTipificacaoVersionada, 'equipes'> | null>;
  listarRegras(): Promise<RegraRegistrada[]>;
  listarSubregras(): Promise<SubregraRegistrada[]>;
  /** Id da regra ou sub-regra com o nome (sem diferenciar maiúsculas), para recusar repetido. */
  regraComNome(nome: string): Promise<string | null>;
  subregraComNome(nome: string): Promise<string | null>;
  /** Cria (com a versão inicial do "fatura") ou atualiza o que não muda o cálculo. */
  salvarRegra(id: string | null, dados: DadosRegra, fatura: FaturaInicial | null): Promise<string>;
  /** Cria ou atualiza; com `reclassificar`, enfileira a reclassificação de todos na mesma transação. */
  salvarSubregra(
    id: string | null,
    dados: DadosSubregra,
    fatura: FaturaInicial | null,
    reclassificar: boolean,
  ): Promise<string>;
  /**
   * Grava as mudanças das versões do "fatura" e os eventos numa transação, com o dono travado:
   * confere de novo que nenhuma competência a partir de `aPartirDe` está fechada ou travada, o
   * `vigencia_ate` de antes de cada encerrar ou reabrir e que nenhuma versão se cruza. Na mesma
   * transação, enfileira a reclassificação de todos (só as abertas mudam).
   */
  aplicarFatura(
    dono: DonoFatura,
    mudancas: MudancaGravada<boolean>[],
    opcoes: OpcoesAplicar,
  ): Promise<void>;
  obterCliente(clienteId: string): Promise<ClienteDaTipificacao | null>;
  /** Versões da configuração do cliente ou unidade, pelo início. */
  listarVersoesCliente(clienteId: string): Promise<VersaoVigente<Configuracao>[]>;
  /** Como o `aplicarFatura`, para a configuração do cliente; reclassifica os laudos do principal. */
  aplicarConfiguracaoCliente(
    clienteId: string,
    principalId: string,
    mudancas: MudancaGravada<Configuracao>[],
    opcoes: OpcoesAplicar,
  ): Promise<void>;
  /** Eventos de auditoria das versões (da entidade), por id, do mais antigo ao mais novo. */
  eventos(entidade: string, ids: string[]): Promise<Map<string, EventoVersao[]>>;
  lerParaPrevia(lote: LotePreviaTipificacao): Promise<LaudoParaPreviaTipificacao[]>;
  listarOpcoes(): Promise<OpcoesTipificacao>;
  /** Dos ids pedidos, os que existem no catálogo (ativos ou não), por tipo. */
  catalogoExistente(ids: {
    modalidades: string[];
    especialidades: string[];
    prioridades: string[];
  }): Promise<{ modalidades: string[]; especialidades: string[]; prioridades: string[] }>;
}
