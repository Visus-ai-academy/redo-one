import { DeleteObjectCommand, GetBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prepararBucket, S3ArmazenamentoArquivos } from './s3-armazenamento-arquivos';

// Roda contra um storage S3 de verdade (o RustFS do docker-compose); sem TEST_S3_ENDPOINT, fica
// "skipped". Usa as mesmas credenciais do dev (S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY).
const endpoint = process.env.TEST_S3_ENDPOINT;
const bucket = 'one-teste';

describe.skipIf(!endpoint)('S3ArmazenamentoArquivos', () => {
  const cliente = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
  });
  const armazenamento = new S3ArmazenamentoArquivos(cliente, bucket);
  const chave = `teste/${Date.now()}.txt`;

  beforeAll(async () => {
    await prepararBucket(cliente, bucket, ['http://localhost:5173']);
  });

  afterAll(async () => {
    await cliente.send(new DeleteObjectCommand({ Bucket: bucket, Key: chave }));
    cliente.destroy();
  });

  const enviar = async (corpo: string, tamanhoBytes: number) => {
    const url = await armazenamento.urlDeEnvio({
      chave,
      tipoConteudo: 'text/plain',
      tamanhoBytes,
      expiraEmSegundos: 60,
    });
    return fetch(url, { method: 'PUT', body: corpo, headers: { 'content-type': 'text/plain' } });
  };

  it('prepararBucket cria o bucket com o CORS das origens do front, e pode rodar de novo', async () => {
    await prepararBucket(cliente, bucket, ['http://localhost:5173']);

    const cors = await cliente.send(new GetBucketCorsCommand({ Bucket: bucket }));
    expect(cors.CORSRules?.[0]?.AllowedOrigins).toEqual(['http://localhost:5173']);
    expect(cors.CORSRules?.[0]?.AllowedMethods).toEqual(['PUT', 'GET']);
  });

  it('arquivo ainda não enviado não tem metadados', async () => {
    expect(await armazenamento.metadados(chave)).toBeNull();
  });

  it('recusa o envio com tamanho diferente do declarado', async () => {
    expect((await enviar('maior que o declarado', 5)).ok).toBe(false);
  });

  it('envia pela URL assinada, lê os metadados e o conteúdo em stream', async () => {
    expect((await enviar('teste', 5)).ok).toBe(true);

    expect(await armazenamento.metadados(chave)).toEqual({
      tamanhoBytes: 5,
      tipoConteudo: 'text/plain',
    });
    const partes: Buffer[] = [];
    for await (const parte of await armazenamento.ler(chave)) partes.push(Buffer.from(parte));
    expect(Buffer.concat(partes).toString()).toBe('teste');
  });

  it('baixa pela URL assinada e remove', async () => {
    const url = await armazenamento.urlDeDownload(chave, 60, 'planilha.txt');
    const resposta = await fetch(url);
    expect(await resposta.text()).toBe('teste');
    expect(resposta.headers.get('content-disposition')).toContain('planilha.txt');

    await armazenamento.remover(chave);
    expect(await armazenamento.metadados(chave)).toBeNull();
  });
});
