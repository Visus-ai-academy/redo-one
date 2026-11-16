import type { Paginacao } from '../../../catalogo/comum/paginacao';
import type { ArmazenamentoArquivos } from '../../../comum/armazenamento/armazenamento-arquivos';
import { ImportacaoNaoEncontradaError } from '../erros';
import type { ConsultaImportacoes } from '../ports/consulta-importacoes';

const VALIDADE_DOWNLOAD_SEGUNDOS = 5 * 60;

/** Histórico das importações, detalhe e download da planilha enviada. */
export class ConsultarImportacoes {
  constructor(
    private readonly consulta: ConsultaImportacoes,
    private readonly armazenamento: ArmazenamentoArquivos,
  ) {}

  listar(paginacao: Paginacao) {
    return this.consulta.listar(paginacao);
  }

  async obter(id: string) {
    const { arquivoChave: _, ...detalhe } = await this.detalhe(id);
    return detalhe;
  }

  async urlDoArquivo(id: string): Promise<string> {
    const d = await this.detalhe(id);
    return this.armazenamento.urlDeDownload(
      d.arquivoChave,
      VALIDADE_DOWNLOAD_SEGUNDOS,
      d.nomeArquivo,
    );
  }

  private async detalhe(id: string) {
    const d = await this.consulta.obter(id);
    if (!d) throw new ImportacaoNaoEncontradaError();
    return d;
  }
}
