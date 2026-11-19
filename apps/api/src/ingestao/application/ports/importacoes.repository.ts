import type { PeriodoDias } from '../../domain/periodo-mobilemed';
import type { FormatoPlanilha } from './leitor-planilha';

export const IMPORTACOES_REPOSITORY = Symbol('IMPORTACOES_REPOSITORY');

/** O upload traz a planilha no storage; a MobileMed, o relatório e o período a buscar. */
export type ImportacaoParaProcessar =
  | { id: string; origem: 'upload_manual'; arquivoChave: string }
  | { id: string; origem: 'mobilemed'; formato: FormatoPlanilha; periodo: PeriodoDias };

export type StatusFinal = 'concluida' | 'recusada' | 'erro';

export interface ResultadoImportacao {
  formato?: FormatoPlanilha;
  janelaInicio?: string;
  janelaFim?: string;
  linhasArquivo?: number;
  inseridos?: number;
  atualizados?: number;
  inalterados?: number;
  removidos?: number;
  invalidas?: number;
  ignoradasCompetenciaFechada?: number;
  errosLinhas?: { linha: number; mensagem: string }[];
  mensagem?: string;
}

export interface ImportacoesRepository {
  /**
   * Marca o arquivo como enviado, cria a importação na fila e enfileira o job, tudo na mesma
   * transação. Devolve o id da importação.
   */
  criarNaFila(dados: { arquivoId: string; enviadaPorId: string; agora: Date }): Promise<string>;
  /**
   * Cria na fila uma importação da MobileMed por relatório (na ordem dada) e enfileira os jobs,
   * na mesma transação. `null`, sem criar nada, se já há uma da MobileMed na fila ou rodando:
   * nunca duas ao mesmo tempo.
   */
  criarMobileMed(dados: {
    formatos: FormatoPlanilha[];
    periodo: PeriodoDias;
    enviadaPorId: string | null;
    agora: Date;
  }): Promise<string[] | null>;
  /** Quando foi criada a última importação da MobileMed (para o intervalo do agendamento). */
  ultimaMobileMedEm(): Promise<Date | null>;
  /**
   * Marca como "processando" a importação na fila (ou que ficou em processamento, numa
   * retentativa). `null` se ela já terminou: o job não faz nada (idempotente).
   */
  iniciar(id: string, agora: Date): Promise<ImportacaoParaProcessar | null>;
  finalizar(
    id: string,
    status: StatusFinal,
    resultado: ResultadoImportacao,
    agora: Date,
  ): Promise<void>;
}
