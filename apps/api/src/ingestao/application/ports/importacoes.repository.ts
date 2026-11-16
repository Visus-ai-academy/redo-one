import type { FormatoPlanilha } from './leitor-planilha';

export const IMPORTACOES_REPOSITORY = Symbol('IMPORTACOES_REPOSITORY');

export interface ImportacaoParaProcessar {
  id: string;
  arquivoChave: string;
}

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
