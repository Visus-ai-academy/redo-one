import { describe, expect, it } from 'vitest';

import { criarArmazenamento } from './criar-armazenamento';
import { S3ArmazenamentoArquivos } from './s3-armazenamento-arquivos';

const config = (valores: Record<string, string>) => ({ get: (nome: string) => valores[nome] });

describe('criarArmazenamento', () => {
  it('com bucket e chaves, usa o S3', () => {
    const armazenamento = criarArmazenamento(
      config({
        S3_BUCKET: 'one',
        S3_ACCESS_KEY_ID: 'chave',
        S3_SECRET_ACCESS_KEY: 'segredo',
        S3_ENDPOINT: 'http://localhost:9000',
        S3_FORCAR_PATH_STYLE: 'true',
      }),
    );
    expect(armazenamento).toBeInstanceOf(S3ArmazenamentoArquivos);
  });

  it('sem configuração, a API sobe, mas o uso diz qual variável falta', async () => {
    const armazenamento = criarArmazenamento(config({}));
    await expect(armazenamento.metadados('x')).rejects.toThrow('S3_BUCKET');
  });
});
