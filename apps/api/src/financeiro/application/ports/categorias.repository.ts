import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import type { DadosCategoria, TipoCategoria } from '../../domain/categoria-financeira';

export const CATEGORIAS_REPOSITORY = Symbol('CATEGORIAS_REPOSITORY');

/** "Todas" é escolha explícita; nunca o filtro vazio. */
export type FiltroSituacao = 'todas' | 'ativas' | 'inativas';

export interface FiltroCategorias extends Paginacao {
  tipo: TipoCategoria;
  situacao: FiltroSituacao;
  /** Parte do nome (da categoria ou do grupo) ou do código contábil. */
  busca?: string;
}

export interface Categoria extends DadosCategoria {
  id: string;
  /** Nome do grupo, quando a categoria está num. */
  grupoNome: string | null;
  /** Quantas categorias estão dentro desta (é um grupo quando passa de zero). */
  totalFilhas: number;
}

export interface CategoriasRepository {
  /** Em árvore: cada grupo seguido das suas categorias, por nome. */
  listar(filtro: FiltroCategorias): Promise<Pagina<Categoria>>;
  /** As ativas, para as listas de escolha (curta: dezenas). */
  opcoes(tipo?: TipoCategoria): Promise<Categoria[]>;
  buscar(id: string): Promise<Categoria | null>;
  /** Mesmo tipo, mesmo grupo e mesmo nome, sem diferenciar maiúsculas. */
  buscarPorNome(
    tipo: TipoCategoria,
    paiId: string | null,
    nome: string,
  ): Promise<{ id: string } | null>;
  criar(dados: DadosCategoria): Promise<string>;
  atualizar(id: string, dados: DadosCategoria): Promise<void>;
  /** `false` quando outro cadastro aponta para ela (categoria dentro, fornecedor, título). */
  excluir(id: string): Promise<boolean>;
}
