import type { Pagina, Paginacao } from '../comum/paginacao';

/**
 * Campos comuns às listas do catálogo (modalidades, especialidades, categorias de exame,
 * prioridades). Uma lista com campo a mais (a prioridade tem `urgente`) estende este tipo.
 */
export interface DadosLista {
  /** Na modalidade, é o código (`MR`, `CT`). */
  nome: string;
  descricao: string | null;
  cor: string | null;
  ordem: number;
  ativo: boolean;
}

/** A prioridade marca, além disso, se é urgente para a distribuição. */
export interface DadosPrioridade extends DadosLista {
  urgente: boolean;
}

/** A subespecialidade pertence a uma ou mais especialidades. */
export interface DadosSubespecialidade extends DadosLista {
  especialidadeIds: string[];
}

export type ItemLista<T extends DadosLista = DadosLista> = T & { id: string };

export interface FiltroLista extends Paginacao {
  /** Parte do nome ou da descrição. */
  busca?: string;
  ativo?: boolean;
}

export interface ListaRepository<T extends DadosLista = DadosLista> {
  listar(filtro: FiltroLista): Promise<Pagina<ItemLista<T>>>;
  buscar(id: string): Promise<ItemLista<T> | null>;
  /** Comparação sem diferenciar maiúsculas. */
  buscarPorNome(nome: string): Promise<{ id: string } | null>;
  criar(dados: T): Promise<string>;
  atualizar(id: string, dados: T): Promise<void>;
  /** `false` quando outro cadastro referencia o item e ele não pôde ser excluído. */
  excluir(id: string): Promise<boolean>;
}
