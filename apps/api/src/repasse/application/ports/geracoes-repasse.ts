import type { DemonstrativoCalculado } from '../../domain/demonstrativo';

export const GERACOES_REPASSE = Symbol('GERACOES_REPASSE');

/** A competência como o repasse a vê (a tabela é do `faturamento`; sem linha = aberta). */
export interface SituacaoCompetencia {
  status: 'aberta' | 'fechada';
  /** Última reabertura: a prévia de antes dela é o resultado de quando estava fechada. */
  reabertaEm: Date | null;
}

export interface NovaGeracao {
  competencia: string;
  tipo: 'previa' | 'recalculo';
  recalculoId: string | null;
  reabertaEm: Date | null;
  geradoEm: Date;
  geradoPorId: string | null;
  demonstrativos: readonly DemonstrativoCalculado[];
}

/** Gerações dos demonstrativos (`geracoes_repasse` e filhas). */
export interface GeracoesRepasse {
  situacao(competencia: string): Promise<SituacaoCompetencia>;
  /** Competências abertas (com linha), a mais antiga primeiro. */
  abertas(): Promise<string[]>;
  /** Fechadas, para mandar o adicional para a próxima aberta. */
  fechadas(): Promise<string[]>;
  /**
   * Grava a geração como a atual. A prévia substitui a prévia anterior do mesmo período aberto
   * (depois da última reabertura); o que veio antes (o resultado de quando estava fechada) e o
   * recálculo nunca se apagam: deixam de ser a atual e ficam como versão.
   */
  gravar(geracao: NovaGeracao): Promise<string>;
}
