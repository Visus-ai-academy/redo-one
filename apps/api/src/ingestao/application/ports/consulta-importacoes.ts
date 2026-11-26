import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import type { FormatoPlanilha } from './leitor-planilha';

export const CONSULTA_IMPORTACOES = Symbol('CONSULTA_IMPORTACOES');

export type StatusImportacao = 'na_fila' | 'processando' | 'concluida' | 'recusada' | 'erro';

export interface ImportacaoResumo {
  id: string;
  status: StatusImportacao;
  origem: 'upload_manual' | 'mobilemed' | 'carga_legado';
  formato: FormatoPlanilha | null;
  /** Nulo na importação da MobileMed (sem planilha). */
  nomeArquivo: string | null;
  enviadaPor: { id: string; nome: string } | null;
  criadaEm: Date;
  iniciadaEm: Date | null;
  concluidaEm: Date | null;
  janelaInicio: string | null;
  janelaFim: string | null;
  linhasArquivo: number | null;
  inseridos: number | null;
  atualizados: number | null;
  inalterados: number | null;
  removidos: number | null;
  invalidas: number | null;
  ignoradasCompetenciaFechada: number | null;
  mensagem: string | null;
}

export interface ImportacaoDetalhe extends ImportacaoResumo {
  errosLinhas: { linha: number; mensagem: string }[];
  /** Chave do arquivo no storage (para a URL de download); nula na MobileMed. */
  arquivoChave: string | null;
}

/** Leitura das importações para a tela (a mais nova primeiro). */
export interface ConsultaImportacoes {
  listar(paginacao: Paginacao): Promise<Pagina<ImportacaoResumo>>;
  obter(id: string): Promise<ImportacaoDetalhe | null>;
}
