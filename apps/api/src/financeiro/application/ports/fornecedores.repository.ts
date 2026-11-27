import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import type { DadosFornecedor, TipoPessoa } from '../../domain/fornecedor';
import type { FiltroSituacao } from './categorias.repository';

export const FORNECEDORES_REPOSITORY = Symbol('FORNECEDORES_REPOSITORY');

export interface FiltroFornecedores extends Paginacao {
  situacao: FiltroSituacao;
  /** Uma categoria padrão ou "todas" (escolha explícita). */
  categoria: 'todas' | { id: string };
  /** Parte do nome (razão social ou fantasia), CNPJ inteiro ou CPF inteiro. */
  busca?: string;
}

/** Linha da lista: o CPF vem só com os dois últimos dígitos (LGPD). */
export interface FornecedorItem {
  id: string;
  tipoPessoa: TipoPessoa;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string | null;
  cpfFinal: string | null;
  categoriaPadraoId: string | null;
  /** "Grupo › Categoria" ou só a categoria. */
  categoriaPadraoNome: string | null;
  ativo: boolean;
}

export interface Fornecedor extends DadosFornecedor {
  id: string;
  categoriaPadraoNome: string | null;
}

export interface FornecedoresRepository {
  /** Por nome (o mais parecido com a busca primeiro). */
  listar(filtro: FiltroFornecedores): Promise<Pagina<FornecedorItem>>;
  buscar(id: string): Promise<Fornecedor | null>;
  /** Outro fornecedor com o mesmo CNPJ ou CPF. */
  buscarPorDocumento(
    documento: { cnpj: string } | { cpf: string },
  ): Promise<{ id: string; razaoSocial: string } | null>;
  criar(dados: DadosFornecedor): Promise<string>;
  atualizar(id: string, dados: DadosFornecedor): Promise<void>;
  /** `false` quando outro registro aponta para ele (título). */
  excluir(id: string): Promise<boolean>;
}
