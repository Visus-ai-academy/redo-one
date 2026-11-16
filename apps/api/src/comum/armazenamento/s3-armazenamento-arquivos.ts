import type { Readable } from 'node:stream';
import {
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type {
  ArmazenamentoArquivos,
  MetadadosArquivo,
  PedidoDeEnvio,
} from './armazenamento-arquivos';

/** Storage em qualquer serviço compatível com S3 (AWS, R2, RustFS no dev). */
export class S3ArmazenamentoArquivos implements ArmazenamentoArquivos {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  urlDeEnvio(p: PedidoDeEnvio): Promise<string> {
    // O tamanho entra na assinatura: o storage recusa um corpo de outro tamanho.
    const comando = new PutObjectCommand({
      Bucket: this.bucket,
      Key: p.chave,
      ContentType: p.tipoConteudo,
      ContentLength: p.tamanhoBytes,
    });
    return getSignedUrl(this.s3, comando, { expiresIn: p.expiraEmSegundos });
  }

  urlDeDownload(chave: string, expiraEmSegundos: number, nomeArquivo?: string): Promise<string> {
    const comando = new GetObjectCommand({
      Bucket: this.bucket,
      Key: chave,
      ResponseContentDisposition: nomeArquivo
        ? `attachment; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`
        : undefined,
    });
    return getSignedUrl(this.s3, comando, { expiresIn: expiraEmSegundos });
  }

  async metadados(chave: string): Promise<MetadadosArquivo | null> {
    try {
      const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: chave }));
      return { tamanhoBytes: r.ContentLength ?? 0, tipoConteudo: r.ContentType ?? null };
    } catch (erro) {
      if ((erro as { name?: string }).name === 'NotFound') return null;
      throw erro;
    }
  }

  async ler(chave: string): Promise<Readable> {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: chave }));
    return r.Body as Readable;
  }

  async remover(chave: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: chave }));
  }
}

/**
 * Cria o bucket (se faltar) com o CORS que deixa o front enviar e baixar direto pela URL assinada.
 * Para o dev (`storage:preparar`); em produção, o bucket é configurado no provedor.
 */
export async function prepararBucket(s3: S3Client, bucket: string, origens: string[]) {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (erro) {
    const jaExiste =
      erro instanceof BucketAlreadyOwnedByYou ||
      (erro as { name?: string }).name === 'BucketAlreadyOwnedByYou' ||
      (erro as { name?: string }).name === 'BucketAlreadyExists';
    if (!jaExiste) throw erro;
  }
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origens,
            AllowedMethods: ['PUT', 'GET'],
            AllowedHeaders: ['*'],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    }),
  );
}
