import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import type {
  BaixaPreparada,
  DadosTitulo,
  EstadoTitulo,
  Favorecido,
  FormaBaixa,
  OrigemTitulo,
  SituacaoTitulo,
  TipoFavorecido,
  TipoTitulo,
} from '../../domain/titulo';

export const TITULOS_REPOSITORY = Symbol('TITULOS_REPOSITORY');

/**
 * Situação na lista. "Em aberto" junta aberto e parcial; "vencidos" é em aberto com vencimento
 * antes de hoje. "Todas" é escolha explícita.
 */
export const SITUACOES_FILTRO_TITULO = [
  'todas',
  'em_aberto',
  'vencidos',
  'aberto',
  'parcial',
  'liquidado',
  'cancelado',
] as const;
export type FiltroSituacaoTitulo = (typeof SITUACOES_FILTRO_TITULO)[number];

export interface FiltroTitulos extends Paginacao {
  tipo: TipoTitulo;
  empresa: 'todas' | { id: string };
  situacao: FiltroSituacaoTitulo;
  origem: 'todas' | OrigemTitulo;
  categoria: 'todas' | { id: string };
  /** Só os títulos deste cliente, fornecedor ou médico. */
  favorecido?: Favorecido;
  /** Vencimento de (inclusive), AAAA-MM-DD. */
  vencimentoDe?: string;
  /** Vencimento até (inclusive), AAAA-MM-DD. */
  vencimentoAte?: string;
  /** Só os títulos gerados por esta recorrência. */
  recorrenciaId?: string;
  /** Nome do favorecido, número (R-0123 ou 123), documento ou descrição. */
  busca?: string;
  /** Dia de hoje em Brasília: decide o que está vencido. */
  hoje: string;
}

export interface TituloItem {
  id: string;
  tipo: TipoTitulo;
  numero: number;
  contratadoId: string;
  empresaNome: string;
  favorecido: Favorecido & { nome: string };
  categoriaId: string;
  /** "Grupo › Categoria" ou só a categoria. */
  categoriaNome: string;
  descricao: string;
  documento: string | null;
  competencia: string | null;
  emissaoEm: string;
  vencimento: string;
  valorCentavos: number;
  pagoCentavos: number;
  situacao: SituacaoTitulo;
  origem: OrigemTitulo;
  contaPrevistaId: string | null;
  /** A recorrência que gerou o título e a ocorrência dela. */
  recorrenciaId: string | null;
  ocorrencia: number | null;
}

export interface PaginaTitulos extends Pagina<TituloItem> {
  /** Saldo em aberto (aberto + parcial) e a parte vencida, de tudo que o filtro pega. */
  totais: { abertoCentavos: number; vencidoCentavos: number };
}

export interface BaixaDoTitulo {
  id: string;
  pagoEm: string;
  contaBancariaId: string;
  contaNome: string;
  principalCentavos: number;
  jurosCentavos: number;
  multaCentavos: number;
  descontoCentavos: number;
  valorMovimentadoCentavos: number;
  forma: FormaBaixa;
  observacao: string | null;
  criadoPorNome: string | null;
  criadoEm: Date;
  estornadaEm: Date | null;
  estornadaPorNome: string | null;
  motivoEstorno: string | null;
}

export interface TituloDetalhe extends TituloItem {
  contaPrevistaNome: string | null;
  vencimentoOriginal: string | null;
  observacoes: string | null;
  canceladoEm: Date | null;
  motivoCancelamento: string | null;
  criadoEm: Date;
  /** Da recorrência: a descrição e se o valor é o previsto (muda todo mês). */
  recorrencia: { id: string; descricao: string; modoValor: 'fixo' | 'previsto' } | null;
  /** Mudado à mão depois de gerado pela recorrência. */
  editadoAMao: boolean;
  /** Da mais nova para a mais antiga, estornadas inclusive. */
  baixas: BaixaDoTitulo[];
}

/** O título travado para alterar: o estado, os dados editáveis e as baixas. */
export interface TituloTravado extends EstadoTitulo {
  id: string;
  tipo: TipoTitulo;
  numero: number;
  origem: OrigemTitulo;
  recorrenciaId: string | null;
  editadoAMao: boolean;
  dados: DadosTitulo;
  baixas: { id: string; principalCentavos: number; estornadaEm: Date | null }[];
}

/** O que se grava no título, além dos dados editáveis. */
export interface CamposTitulo extends DadosTitulo {
  pagoCentavos: number;
  situacao: SituacaoTitulo;
  vencimentoOriginal: string | null;
  canceladoEm: Date | null;
  canceladoPorId: string | null;
  motivoCancelamento: string | null;
  editadoAMao: boolean;
}

/** As escritas possíveis dentro da trava do título (a mesma transação). */
export interface EscritaTitulo {
  atualizar(campos: Partial<CamposTitulo>): Promise<void>;
  inserirBaixa(baixa: BaixaPreparada & { criadoPorId: string }): Promise<string>;
  estornarBaixa(
    baixaId: string,
    estorno: { em: Date; porId: string; motivo: string },
  ): Promise<void>;
}

export interface NovoTitulo {
  tipo: TipoTitulo;
  dados: DadosTitulo;
  criadoPorId: string | null;
}

export interface TitulosRepository {
  /** Por vencimento e número. */
  listar(filtro: FiltroTitulos): Promise<PaginaTitulos>;
  buscar(id: string): Promise<TituloDetalhe | null>;
  /** Cria com o próximo número da empresa e do tipo. */
  criar(novo: NovoTitulo): Promise<{ id: string; numero: number }>;
  /**
   * Trava o título (nenhuma outra baixa ou edição entra no meio) e roda `fn` na mesma transação;
   * `null` se o título não existe. Erro em `fn` desfaz tudo.
   */
  alterar<T>(
    id: string,
    fn: (titulo: TituloTravado | null, escrita: EscritaTitulo) => Promise<T>,
  ): Promise<T>;
}

/** Cliente, fornecedor ou médico que o título pode ter (só leitura dos cadastros). */
export interface OpcaoFavorecido {
  tipo: TipoFavorecido;
  id: string;
  nome: string;
  /** Nome fantasia do fornecedor ou do cliente, quando há. */
  detalhe: string | null;
  /** Do fornecedor: a categoria sugerida ao lançar a despesa. */
  categoriaPadraoId: string | null;
}

export const FAVORECIDOS = Symbol('FAVORECIDOS');

export interface Favorecidos {
  /** O cadastro existe? `unidadeDe`: o cliente é unidade deste principal. */
  buscar(
    favorecido: Favorecido,
  ): Promise<{ nome: string; ativo: boolean; unidadeDe: string | null } | null>;
  /**
   * Ativos para escolher no título: clientes principais (a receber) ou fornecedores e médicos (a
   * pagar), o mais parecido com a busca primeiro.
   */
  opcoes(tipo: TipoTitulo, busca: string | undefined, limite: number): Promise<OpcaoFavorecido[]>;
}
