import type { Pagina, Paginacao } from '../comum/paginacao';

export type TipoDeParaEspecialidade = 'normalizacao' | 'invalida' | 'regiao_anatomica';

/** Valor bruto de prioridade que chega na importação → prioridade do catálogo. */
export interface DadosDeParaPrioridade {
  origem: string;
  prioridadeId: string;
  ativo: boolean;
}

/** Código de modalidade que chega na importação → modalidade do catálogo (`OT` → `DO`). */
export interface DadosDeParaModalidade {
  origem: string;
  modalidadeId: string;
  ativo: boolean;
}

/** Valor do campo especialidade na importação → especialidade (ou marcado como não especialidade). */
export interface DadosDeParaEspecialidade {
  tipo: TipoDeParaEspecialidade;
  origem: string;
  /** Vazio só no tipo `invalida`. */
  especialidadeId: string | null;
  ativo: boolean;
  observacoes: string | null;
}

/** Quantas unidades vale o laudo do estudo que chega com VALORES zerado. */
export interface DadosDeParaValor {
  estudoDescricao: string;
  valores: number;
  /** Exame do catálogo que completa categoria e especialidade de quem não está no catálogo. */
  exameId: string | null;
  ativo: boolean;
}

/** Sufixo cortado do nome do cliente antes de resolver o cliente. */
export interface DadosSufixo {
  sufixo: string;
  ativo: boolean;
  observacoes: string | null;
}

/** O item como a tela vê: os dados, o id e o nome do destino (quando há). */
export type ItemDePara<D> = D & { id: string; destinoNome?: string | null };

export interface FiltroDePara extends Paginacao {
  /** Parte do valor de origem. */
  busca?: string;
  ativo?: boolean;
  /** Só no de-para de especialidade. */
  tipo?: TipoDeParaEspecialidade;
  /** As variações de uma forma certa (prioridade, especialidade ou exame de destino). */
  destinoId?: string;
}

export interface DeParaRepository<D> {
  listar(filtro: FiltroDePara): Promise<Pagina<ItemDePara<D>>>;
  buscar(id: string): Promise<ItemDePara<D> | null>;
  /** O de-para que já trata a mesma origem (a chave única da tabela). */
  buscarIgual(dados: D): Promise<{ id: string } | null>;
  /** Lança `ReferenciaInexistenteError` se o destino não existe. */
  criar(dados: D): Promise<string>;
  atualizar(id: string, dados: D): Promise<void>;
  excluir(id: string): Promise<void>;
}
