import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import type { CompetenciasBloqueadas } from '../../../ingestao/application/ports/competencias-bloqueadas';
import type { StatusCompetencia } from '../../domain/competencia-status';

export const COMPETENCIAS_REPOSITORY = Symbol('COMPETENCIAS_REPOSITORY');

/** Linha da lista de competências. Autor = nome do usuário ou, na migração, o texto do dashboards-one. */
export interface CompetenciaResumo {
  competencia: string;
  status: StatusCompetencia;
  fechadaEm: Date | null;
  fechadaPor: string | null;
  reabertaEm: Date | null;
  reabertaPor: string | null;
  importacaoTravadaEm: Date | null;
  importacaoTravadaPor: string | null;
  observacoes: string | null;
  /** Fechada apesar de avisos pendentes que impediam: o motivo de quem fechou. */
  fechadaComAvisosMotivo: string | null;
  /** Laudos não removidos com esta competência. */
  laudos: number;
  /** Soma do volume desses laudos. */
  volume: number;
}

export interface SituacaoCompetencia {
  status: StatusCompetencia;
  importacaoTravada: boolean;
}

/** Quem fez a ação e quando. */
export interface Autor {
  usuarioId: string;
  em: Date;
}

/**
 * Tabela `competencias`. Também é a porta `CompetenciasBloqueadas` da `ingestao` (`listar` devolve
 * as fechadas ou com a importação travada; `garantir` cria as que faltam).
 */
export interface CompetenciasRepository extends CompetenciasBloqueadas {
  /** Mais nova primeiro, com laudos e volume somados só das da página. */
  listarPagina(paginacao: Paginacao): Promise<Pagina<CompetenciaResumo>>;
  /** Nulo se a competência não tem linha. */
  obter(competencia: string): Promise<SituacaoCompetencia | null>;
  /** A mais recente com status fechada; nulo se nenhuma. */
  ultimaFechada(): Promise<string | null>;
  /**
   * Só se ainda estiver aberta; `false` se outra requisição mudou antes. `motivoAvisos`: fechada
   * apesar de avisos pendentes que impedem fechar (nulo no fechamento normal).
   */
  fechar(competencia: string, autor: Autor, motivoAvisos?: string | null): Promise<boolean>;
  /** Só se ainda estiver fechada; não mexe na trava. */
  reabrir(competencia: string, autor: Autor): Promise<boolean>;
  /** Só se ainda não estiver travada. */
  travarImportacao(competencia: string, autor: Autor): Promise<boolean>;
  /**
   * Só se estiver travada; limpa quem travou e quando e, na mesma transação, enfileira o recálculo
   * da competência de todos os laudos.
   */
  destravarImportacao(competencia: string): Promise<boolean>;
}
