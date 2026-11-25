import type { Arranjo } from '../../domain/preco';
import type { MudancaPreco, VersaoPreco } from '../../domain/versoes-preco';

export const PRECOS_REPOSITORY = Symbol('PRECOS_REPOSITORY');

/** De quem é a tabela: um cliente (ou unidade) ou um contratado (a tabela padrão). */
export type TipoDono = 'cliente' | 'contratado';
export interface Dono {
  tipo: TipoDono;
  id: string;
}

export interface InfoDono {
  nome: string;
  /** Só a unidade: o principal, de onde vem o preço que faltar nela. */
  principal: { id: string; nome: string } | null;
}

/** A versão com os nomes do arranjo, para a tela e a planilha. */
export interface VersaoComNomes extends VersaoPreco {
  nomes: { modalidade: string; especialidade: string; categoria: string; prioridade: string };
}

export interface OpcaoPreco {
  id: string;
  nome: string;
}

/** Cadastros que a tela e a planilha usam (só os ativos, na ordem do catálogo). */
export interface OpcoesPreco {
  modalidades: OpcaoPreco[];
  especialidades: OpcaoPreco[];
  categorias: OpcaoPreco[];
  prioridades: OpcaoPreco[];
  contratados: OpcaoPreco[];
}

/** Quem fez o quê numa versão, dos eventos de auditoria. */
export interface EventoVersao {
  acao: string;
  /** Nome do usuário; nulo quando veio da carga do dashboards-one. */
  quem: string | null;
  em: Date;
}

/** Tabelas `precos_cliente` e `precos_padrao_contratado`. */
export interface PrecosRepository {
  /** Nulo se o cliente ou o contratado não existe. */
  obterDono(dono: Dono): Promise<InfoDono | null>;
  /** Todas as versões do dono (ou só as do arranjo), com os nomes. */
  listarVersoes(dono: Dono, arranjo?: Arranjo): Promise<VersaoComNomes[]>;
  /**
   * Grava as mudanças numa transação e devolve os ids das versões criadas, na ordem. O encerrar
   * confere o `vigencia_ate` de antes: se outra pessoa mudou a versão no meio, nada é gravado e
   * lança `VersaoAlteradaError`.
   */
  aplicar(dono: Dono, mudancas: MudancaPreco[], autor: { usuarioId: string }): Promise<string[]>;
  opcoes(): Promise<OpcoesPreco>;
  /** Eventos de auditoria das versões, por id, do mais antigo ao mais novo. */
  eventos(dono: Dono, ids: string[]): Promise<Map<string, EventoVersao[]>>;
}
