import type { Pagina, Paginacao } from '../comum/paginacao';

export const QUEBRAS_REPOSITORY = Symbol('QUEBRAS_REPOSITORY');

export interface Referencia {
  id: string;
  nome: string;
}

export interface DadosPeca {
  exameId: string;
  /** Usada só quando o exame não tem categoria; vazio usa a do exame. */
  categoriaId: string | null;
  ativo: boolean;
}

export interface Peca {
  id: string;
  exame: Referencia;
  categoria: Referencia | null;
  ativo: boolean;
}

export interface QuebraResumo {
  id: string;
  estudoOrigem: string;
  /** Exames em que o estudo se quebra, em ordem de nome. */
  pecas: { nome: string; ativo: boolean }[];
  /** O exame do cadastro com o mesmo nome do estudo, se houver. */
  exame: Referencia | null;
}

export interface QuebraDetalhe {
  id: string;
  estudoOrigem: string;
  chaveNormalizada: string;
  exame: Referencia | null;
  pecas: Peca[];
}

export interface FiltroQuebras extends Paginacao {
  /** Parte do nome do estudo ou de uma peça. */
  busca?: string;
}

export interface QuebrasRepository {
  listar(filtro: FiltroQuebras): Promise<Pagina<QuebraResumo>>;
  buscar(id: string): Promise<QuebraDetalhe | null>;
  buscarPorChave(chave: string): Promise<{ id: string; estudoOrigem: string } | null>;
  /** Nome e chave do exame, para validar a peça. */
  buscarExame(id: string): Promise<{ nome: string; chaveNormalizada: string } | null>;
  criar(dados: { estudoOrigem: string; chaveNormalizada: string }): Promise<string>;
  atualizar(id: string, dados: { estudoOrigem: string; chaveNormalizada: string }): Promise<void>;
  excluir(id: string): Promise<void>;
  /** Lança `ReferenciaInexistenteError` se a categoria não existe. */
  criarPeca(quebraId: string, dados: DadosPeca): Promise<string>;
  atualizarPeca(pecaId: string, dados: DadosPeca): Promise<void>;
  excluirPeca(pecaId: string): Promise<void>;
}
