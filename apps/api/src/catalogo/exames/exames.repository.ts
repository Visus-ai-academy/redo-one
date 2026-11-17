import type { Pagina, Paginacao } from '../comum/paginacao';

export const EXAMES_REPOSITORY = Symbol('EXAMES_REPOSITORY');

export interface DadosExame {
  /** Não é único: há homônimos raros. */
  nome: string;
  codigo: string | null;
  descricao: string | null;
  modalidadeId: string | null;
  especialidadeId: string | null;
  /** Vazio: o exame não vai para médico restrito a uma subespecialidade. */
  subespecialidadeId: string | null;
  categoriaId: string | null;
  prioridadeId: string | null;
  permiteQuebra: boolean;
  exigeRevisaoManual: boolean;
  ativo: boolean;
}

export interface Referencia {
  id: string;
  nome: string;
}

export interface ExameResumo {
  id: string;
  nome: string;
  codigo: string | null;
  modalidade: Referencia | null;
  especialidade: Referencia | null;
  subespecialidade: Referencia | null;
  categoria: Referencia | null;
  prioridade: Referencia | null;
  exigeRevisaoManual: boolean;
  ativo: boolean;
}

export interface ExameDetalhe extends DadosExame {
  id: string;
  /** A quebra do estudo com o mesmo nome (chave normalizada), se houver. */
  quebra: { id: string; totalPecas: number } | null;
}

export interface FiltroExames extends Paginacao {
  /** Parte do nome ou o código. */
  busca?: string;
  modalidadeId?: string;
  especialidadeId?: string;
  subespecialidadeId?: string;
  ativo?: boolean;
}

export interface ExamesRepository {
  listar(filtro: FiltroExames): Promise<Pagina<ExameResumo>>;
  buscar(id: string): Promise<ExameDetalhe | null>;
  /** Lança `ReferenciaInexistenteError` se algum cadastro ligado não existe. */
  criar(dados: DadosExame & { chaveNormalizada: string }): Promise<string>;
  atualizar(id: string, dados: DadosExame & { chaveNormalizada: string }): Promise<void>;
  /** `false` quando o exame é peça de uma quebra ou outro cadastro o usa. */
  excluir(id: string): Promise<boolean>;
}
