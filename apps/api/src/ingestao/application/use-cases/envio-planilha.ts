import { randomUUID } from 'node:crypto';

import type { ArmazenamentoArquivos } from '../../../comum/armazenamento/armazenamento-arquivos';
import { ArquivoInvalidoError, ArquivoNaoEncontradoError } from '../erros';
import type { ArquivosRepository } from '../ports/arquivos.repository';
import type { ImportacoesRepository } from '../ports/importacoes.repository';

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Limite técnico do envio (o mesmo do dashboards-one); dois meses de laudos dão ~10 MB. */
const TAMANHO_MAXIMO = 50 * 1024 * 1024;
const VALIDADE_URL_SEGUNDOS = 10 * 60;

export interface PedidoEnvio {
  usuarioId: string;
  nomeArquivo: string;
  tamanhoBytes: number;
  tipoConteudo: string;
}

/**
 * Primeiro passo do envio: registra o arquivo e devolve a URL assinada para o navegador mandar a
 * planilha direto ao storage (a API nunca recebe o arquivo).
 */
export class PrepararEnvio {
  constructor(
    private readonly arquivos: ArquivosRepository,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly agora: () => Date,
  ) {}

  async executar(p: PedidoEnvio) {
    if (!p.nomeArquivo.toLowerCase().endsWith('.xlsx') || p.tipoConteudo !== TIPO_XLSX) {
      throw new ArquivoInvalidoError('Envie a planilha em .xlsx.');
    }
    if (p.tamanhoBytes <= 0) throw new ArquivoInvalidoError('O arquivo está vazio.');
    if (p.tamanhoBytes > TAMANHO_MAXIMO)
      throw new ArquivoInvalidoError('O arquivo passa de 50 MB.');

    const chave = `ingestao/${randomUUID()}.xlsx`;
    const arquivoId = await this.arquivos.criar({
      chave,
      nomeOriginal: p.nomeArquivo,
      tipoConteudo: p.tipoConteudo,
      tamanhoBytes: p.tamanhoBytes,
      criadoPorId: p.usuarioId,
    });
    const url = await this.armazenamento.urlDeEnvio({
      chave,
      tipoConteudo: p.tipoConteudo,
      tamanhoBytes: p.tamanhoBytes,
      expiraEmSegundos: VALIDADE_URL_SEGUNDOS,
    });
    return {
      arquivoId,
      url,
      expiraEm: new Date(this.agora().getTime() + VALIDADE_URL_SEGUNDOS * 1000),
    };
  }
}

/** Segundo passo: com a planilha no storage, cria a importação e a põe na fila. */
export class ConfirmarEnvio {
  constructor(
    private readonly arquivos: ArquivosRepository,
    private readonly importacoes: ImportacoesRepository,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly agora: () => Date,
  ) {}

  async executar(p: { usuarioId: string; arquivoId: string }): Promise<string> {
    const arquivo = await this.arquivos.obter(p.arquivoId);
    if (!arquivo || arquivo.criadoPorId !== p.usuarioId) throw new ArquivoNaoEncontradoError();
    if (arquivo.enviadoEm) {
      throw new ArquivoInvalidoError('Esta planilha já foi enviada para importação.');
    }
    const noStorage = await this.armazenamento.metadados(arquivo.chave);
    if (!noStorage || noStorage.tamanhoBytes !== arquivo.tamanhoBytes) {
      throw new ArquivoInvalidoError('A planilha não chegou ao storage. Envie de novo.');
    }
    return this.importacoes.criarNaFila({
      arquivoId: arquivo.id,
      enviadaPorId: p.usuarioId,
      agora: this.agora(),
    });
  }
}
