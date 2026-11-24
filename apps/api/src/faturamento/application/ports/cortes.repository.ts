import type { LeitorCortesCompetencia } from '../../../ingestao/application/ports/cortes-competencia';
import type { Corte } from '../../../ingestao/domain/competencia';
import type { NovaVigencia } from '../../domain/vigencia-corte';
import type { Autor } from './competencias.repository';

export const CORTES_REPOSITORY = Symbol('CORTES_REPOSITORY');

/** Vigência gravada, como a tela mostra no histórico. */
export interface VigenciaRegistrada {
  id: string;
  clienteId: string | null;
  desde: string;
  /** Nulo = "usa o padrão". */
  corte: Corte | null;
  criadoEm: Date;
  /** Nome de quem criou; nulo na vigência padrão inicial. */
  criadoPor: string | null;
}

/** Tabela `cortes_competencia`. Também é a porta `LeitorCortesCompetencia` da `ingestao`. */
export interface CortesRepository extends LeitorCortesCompetencia {
  /** Grava a vigência padrão inicial se não houver nenhuma vigência padrão. Idempotente. */
  garantirPadraoInicial(): Promise<void>;
  /** Do cliente (nulo = do padrão), mais nova primeiro. */
  listarVigencias(clienteId: string | null): Promise<VigenciaRegistrada[]>;
  clienteExiste(clienteId: string): Promise<boolean>;
  /**
   * Grava a vigência e enfileira o recálculo da competência dos laudos atingidos (do cliente ou,
   * no padrão, de todos), na mesma transação. Devolve o id.
   */
  criar(vigencia: NovaVigencia, autor: Autor): Promise<string>;
}
