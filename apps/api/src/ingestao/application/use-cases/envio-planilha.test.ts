import { beforeEach, describe, expect, it } from 'vitest';

import type { ArmazenamentoArquivos } from '../../../comum/armazenamento/armazenamento-arquivos';
import { ArquivosEmMemoria, ImportacoesEmMemoria } from '../../testing/fakes';
import { ArquivoInvalidoError, ArquivoNaoEncontradoError } from '../erros';
import { ConfirmarEnvio, PrepararEnvio, TIPO_XLSX } from './envio-planilha';

const agora = new Date('2026-11-16T12:00:00Z');

describe('envio da planilha', () => {
  let arquivos: ArquivosEmMemoria;
  let importacoes: ImportacoesEmMemoria;
  let noStorage: Map<string, number>;
  const pedidos: unknown[] = [];

  const armazenamento = {
    urlDeEnvio: async (pedido: unknown) => {
      pedidos.push(pedido);
      return 'https://storage/url-assinada';
    },
    metadados: async (chave: string) =>
      noStorage.has(chave)
        ? { tamanhoBytes: noStorage.get(chave) ?? 0, tipoConteudo: TIPO_XLSX }
        : null,
  } as unknown as ArmazenamentoArquivos;

  const preparar = () => new PrepararEnvio(arquivos, armazenamento, () => agora);
  const confirmar = () => new ConfirmarEnvio(arquivos, importacoes, armazenamento, () => agora);
  const pedido = {
    usuarioId: 'u1',
    nomeArquivo: 'laudos.xlsx',
    tamanhoBytes: 1000,
    tipoConteudo: TIPO_XLSX,
  };

  beforeEach(() => {
    arquivos = new ArquivosEmMemoria();
    importacoes = new ImportacoesEmMemoria(arquivos);
    noStorage = new Map();
    pedidos.length = 0;
  });

  describe('PrepararEnvio', () => {
    it('registra o arquivo e devolve a URL assinada com o tamanho exato, por 10 minutos', async () => {
      const envio = await preparar().executar(pedido);

      expect(envio).toEqual({
        arquivoId: expect.any(String),
        url: 'https://storage/url-assinada',
        expiraEm: new Date('2026-11-16T12:10:00Z'),
      });
      const arquivo = await arquivos.obter(envio.arquivoId);
      expect(arquivo).toMatchObject({
        nomeOriginal: 'laudos.xlsx',
        criadoPorId: 'u1',
        enviadoEm: null,
      });
      expect(arquivo?.chave).toMatch(/^ingestao\/[0-9a-f-]{36}\.xlsx$/);
      expect(pedidos).toEqual([
        {
          chave: arquivo?.chave,
          tipoConteudo: TIPO_XLSX,
          tamanhoBytes: 1000,
          expiraEmSegundos: 600,
        },
      ]);
    });

    it.each([
      ['planilha.csv', TIPO_XLSX, 1000, 'Envie a planilha em .xlsx.'],
      ['laudos.xlsx', 'text/plain', 1000, 'Envie a planilha em .xlsx.'],
      ['laudos.xlsx', TIPO_XLSX, 0, 'O arquivo está vazio.'],
      ['laudos.xlsx', TIPO_XLSX, 51 * 1024 * 1024, 'O arquivo passa de 50 MB.'],
    ])('recusa %s (%s, %d bytes)', async (nomeArquivo, tipoConteudo, tamanhoBytes, mensagem) => {
      await expect(
        preparar().executar({ ...pedido, nomeArquivo, tipoConteudo, tamanhoBytes }),
      ).rejects.toThrow(new ArquivoInvalidoError(mensagem));
    });
  });

  describe('ConfirmarEnvio', () => {
    it('com o arquivo no storage, cria a importação na fila', async () => {
      const { arquivoId } = await preparar().executar(pedido);
      const chave = (await arquivos.obter(arquivoId))?.chave ?? '';
      noStorage.set(chave, 1000);

      const id = await confirmar().executar({ usuarioId: 'u1', arquivoId });

      expect(importacoes.itens.get(id)).toMatchObject({ status: 'na_fila', arquivoChave: chave });
    });

    it('recusa se o arquivo não chegou ao storage ou chegou com outro tamanho', async () => {
      const { arquivoId } = await preparar().executar(pedido);

      await expect(confirmar().executar({ usuarioId: 'u1', arquivoId })).rejects.toThrow(
        'A planilha não chegou ao storage. Envie de novo.',
      );
      noStorage.set((await arquivos.obter(arquivoId))?.chave ?? '', 999);
      await expect(confirmar().executar({ usuarioId: 'u1', arquivoId })).rejects.toThrow(
        'A planilha não chegou ao storage. Envie de novo.',
      );
    });

    it('só quem enviou confirma, e só uma vez', async () => {
      const { arquivoId } = await preparar().executar(pedido);
      noStorage.set((await arquivos.obter(arquivoId))?.chave ?? '', 1000);

      await expect(confirmar().executar({ usuarioId: 'outro', arquivoId })).rejects.toThrow(
        ArquivoNaoEncontradoError,
      );
      await confirmar().executar({ usuarioId: 'u1', arquivoId });
      await expect(confirmar().executar({ usuarioId: 'u1', arquivoId })).rejects.toThrow(
        'Esta planilha já foi enviada para importação.',
      );
    });
  });
});
