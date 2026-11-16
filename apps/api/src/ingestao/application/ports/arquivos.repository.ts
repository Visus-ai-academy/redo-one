export const ARQUIVOS_REPOSITORY = Symbol('ARQUIVOS_REPOSITORY');

export interface ArquivoIngestao {
  id: string;
  chave: string;
  nomeOriginal: string;
  tamanhoBytes: number | null;
  criadoPorId: string | null;
  enviadoEm: Date | null;
}

export interface ArquivosRepository {
  criar(dados: {
    chave: string;
    nomeOriginal: string;
    tipoConteudo: string;
    tamanhoBytes: number;
    criadoPorId: string;
  }): Promise<string>;
  /** Só arquivos do contexto `ingestao`. */
  obter(id: string): Promise<ArquivoIngestao | null>;
}
