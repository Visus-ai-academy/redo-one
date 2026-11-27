import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import type { DadosRecorrencia, Frequencia, SituacaoRecorrencia } from '../../domain/recorrencia';
import type { DadosTitulo, Favorecido, TipoTitulo } from '../../domain/titulo';

export const RECORRENCIAS_REPOSITORY = Symbol('RECORRENCIAS_REPOSITORY');

export interface FiltroRecorrencias extends Paginacao {
  tipo: TipoTitulo;
  empresa: 'todas' | { id: string };
  situacao: 'todas' | SituacaoRecorrencia;
  frequencia: 'todas' | Frequencia;
  /** Parte da descrição ou do nome do favorecido. */
  busca?: string;
  /** Dia de hoje em Brasília: o próximo vencimento é o primeiro em aberto a partir dele. */
  hoje: string;
}

export interface RecorrenciaItem {
  id: string;
  tipo: TipoTitulo;
  contratadoId: string;
  empresaNome: string;
  favorecido: Favorecido & { nome: string };
  descricao: string;
  valorCentavos: number;
  modoValor: DadosRecorrencia['modoValor'];
  frequencia: Frequencia;
  diaVencimento: number | null;
  termino: DadosRecorrencia['termino'];
  terminoEm: string | null;
  terminoOcorrencias: number | null;
  situacao: SituacaoRecorrencia;
  encerradaEm: Date | null;
  /** O primeiro título gerado em aberto, de hoje em diante. */
  proximoVencimento: string | null;
}

export interface PaginaRecorrencias extends Pagina<RecorrenciaItem> {
  /** Valor e frequência das ativas que o filtro pega (para o previsto por mês). */
  ativas: { valorCentavos: number; frequencia: Frequencia }[];
}

/** A recorrência gravada, com os nomes e o que ela já gerou. */
export interface Recorrencia extends DadosRecorrencia {
  id: string;
  tipo: TipoTitulo;
  situacao: SituacaoRecorrencia;
  geraAPartirDe: string;
  empresaNome: string;
  favorecidoNome: string;
  categoriaNome: string;
  contaPrevistaNome: string | null;
  encerradaEm: Date | null;
  motivoEncerramento: string | null;
  criadoEm: Date;
  /** As ocorrências que já têm título (1ª, 2ª...). */
  ocorrencias: number[];
}

/** O que a recorrência grava, além dos dados. */
export interface CamposRecorrencia extends DadosRecorrencia {
  situacao: SituacaoRecorrencia;
  geraAPartirDe: string;
  encerradaEm: Date | null;
  encerradaPorId: string | null;
  motivoEncerramento: string | null;
}

/** Título gerado, em aberto, sem baixa e não editado à mão: a edição da recorrência alcança. */
export interface TituloAjustavel {
  id: string;
  numero: number;
  ocorrencia: number;
  dados: DadosTitulo;
}

export interface RecorrenciasRepository {
  /** Ativas primeiro, depois pela descrição. */
  listar(filtro: FiltroRecorrencias): Promise<PaginaRecorrencias>;
  buscar(id: string): Promise<Recorrencia | null>;
  criar(
    tipo: TipoTitulo,
    dados: DadosRecorrencia,
    extras: { geraAPartirDe: string; criadoPorId: string },
  ): Promise<string>;
  atualizar(id: string, campos: Partial<CamposRecorrencia>): Promise<void>;
  /** As ativas (para o job diário). */
  ativas(): Promise<string[]>;
  /**
   * Cria os títulos das ocorrências que ainda não existem, numerados em sequência, com a
   * recorrência travada (duas gerações ao mesmo tempo não duplicam nem pulam número).
   */
  gerarTitulos(
    id: string,
    tipo: TipoTitulo,
    novos: { ocorrencia: number; dados: DadosTitulo }[],
    criadoPorId: string | null,
  ): Promise<{ id: string; numero: number; ocorrencia: number }[]>;
  titulosAjustaveis(id: string): Promise<TituloAjustavel[]>;
  /** Grava os dados novos nos títulos que continuam ajustáveis; devolve os que mudaram. */
  aplicarNosTitulos(mudancas: { tituloId: string; dados: DadosTitulo }[]): Promise<string[]>;
}
