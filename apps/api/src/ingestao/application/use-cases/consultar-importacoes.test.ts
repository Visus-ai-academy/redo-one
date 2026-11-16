import { describe, expect, it, vi } from 'vitest';

import type { ArmazenamentoArquivos } from '../../../comum/armazenamento/armazenamento-arquivos';
import { ImportacaoNaoEncontradaError } from '../erros';
import type { ConsultaImportacoes, ImportacaoDetalhe } from '../ports/consulta-importacoes';
import { ConsultarImportacoes } from './consultar-importacoes';

const detalhe = {
  id: 'i1',
  nomeArquivo: 'laudos.xlsx',
  arquivoChave: 'ingestao/x.xlsx',
} as ImportacaoDetalhe;

const consulta: ConsultaImportacoes = {
  listar: async () => ({ itens: [], total: 0 }),
  obter: async (id) => (id === 'i1' ? detalhe : null),
};
const armazenamento = {
  urlDeDownload: vi.fn(async () => 'https://storage/baixar'),
} as unknown as ArmazenamentoArquivos;

describe('ConsultarImportacoes', () => {
  const consultar = new ConsultarImportacoes(consulta, armazenamento);

  it('o detalhe não expõe a chave do arquivo no storage', async () => {
    const r = await consultar.obter('i1');
    expect(r).not.toHaveProperty('arquivoChave');
    expect(r.nomeArquivo).toBe('laudos.xlsx');
  });

  it('importação que não existe é erro de não encontrada', async () => {
    await expect(consultar.obter('nada')).rejects.toThrow(ImportacaoNaoEncontradaError);
    await expect(consultar.urlDoArquivo('nada')).rejects.toThrow(ImportacaoNaoEncontradaError);
  });

  it('a URL de download vale 5 minutos e baixa com o nome original', async () => {
    expect(await consultar.urlDoArquivo('i1')).toBe('https://storage/baixar');
    expect(armazenamento.urlDeDownload).toHaveBeenCalledWith('ingestao/x.xlsx', 300, 'laudos.xlsx');
  });
});
