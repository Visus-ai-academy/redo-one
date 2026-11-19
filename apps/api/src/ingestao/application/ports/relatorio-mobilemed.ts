import type { PeriodoDias } from '../../domain/periodo-mobilemed';
import type { FormatoPlanilha, PlanilhaLida } from './leitor-planilha';

export const RELATORIO_MOBILEMED = Symbol('RELATORIO_MOBILEMED');

export interface FatiamentoRelatorio {
  /** Tamanho inicial de cada chamada. */
  janelaDias: number;
  /** Itens a partir dos quais a resposta é tida como cortada e a janela é refeita em metades. */
  teto: number;
}

/**
 * O relatório de laudos da MobileMed, lido pela API do portal e entregue como as linhas da
 * planilha (mesmas colunas do XLSX), para entrar no mesmo caminho do upload. `laudos` junta o "no
 * padrão" e o "fora do padrão" do período; `compartilhamento` é o de exames compartilhados.
 */
export interface RelatorioMobileMed {
  buscar(
    formato: FormatoPlanilha,
    periodo: PeriodoDias,
    fatiamento: FatiamentoRelatorio,
  ): Promise<PlanilhaLida>;
}

/** Falha da MobileMed (fora do ar, sessão, resposta fora do formato); a mensagem é curta e segura. */
export class RelatorioMobileMedError extends Error {}
