import type { Readable } from 'node:stream';

/** Token de injeção do storage de arquivos. */
export const ARMAZENAMENTO_ARQUIVOS = Symbol('ARMAZENAMENTO_ARQUIVOS');

export interface PedidoDeEnvio {
  chave: string;
  tipoConteudo: string;
  /** Tamanho exato declarado: o storage recusa um arquivo de outro tamanho. */
  tamanhoBytes: number;
  expiraEmSegundos: number;
}

export interface MetadadosArquivo {
  tamanhoBytes: number;
  tipoConteudo: string | null;
}

/**
 * Storage compatível com S3, privado: o navegador envia e baixa direto do storage por URL assinada
 * e temporária, e a API lê em stream (nunca o arquivo inteiro na memória nem no disco).
 */
export interface ArmazenamentoArquivos {
  urlDeEnvio(pedido: PedidoDeEnvio): Promise<string>;
  urlDeDownload(chave: string, expiraEmSegundos: number, nomeArquivo?: string): Promise<string>;
  /** `null` quando o arquivo não existe (ex.: o envio não terminou). */
  metadados(chave: string): Promise<MetadadosArquivo | null>;
  ler(chave: string): Promise<Readable>;
  remover(chave: string): Promise<void>;
}
