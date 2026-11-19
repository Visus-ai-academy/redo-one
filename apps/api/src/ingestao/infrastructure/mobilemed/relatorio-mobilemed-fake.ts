import type { FormatoPlanilha, PlanilhaLida } from '../../application/ports/leitor-planilha';
import {
  type RelatorioMobileMed,
  RelatorioMobileMedError,
} from '../../application/ports/relatorio-mobilemed';

/**
 * `INGESTAO_MOBILEMED=fake` (desenvolvimento): o agendamento e o "Importar agora" funcionam, mas o
 * relatório volta vazio, então a importação termina com erro sem mexer nos laudos. Laudos
 * sintéticos removeriam os de verdade da janela no banco de dev.
 */
export class RelatorioMobileMedFake implements RelatorioMobileMed {
  async buscar(formato: FormatoPlanilha): Promise<PlanilhaLida> {
    return { formato, linhas: [] };
  }
}

/** Sem `INGESTAO_MOBILEMED`: uma importação que ficou na fila termina com erro, sem chamar ninguém. */
export class RelatorioMobileMedDesligado implements RelatorioMobileMed {
  async buscar(): Promise<PlanilhaLida> {
    throw new RelatorioMobileMedError('A importação da MobileMed está desligada neste ambiente.');
  }
}
