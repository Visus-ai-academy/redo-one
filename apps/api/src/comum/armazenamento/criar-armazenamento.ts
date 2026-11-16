import { S3Client } from '@aws-sdk/client-s3';

import type { ArmazenamentoArquivos } from './armazenamento-arquivos';
import { S3ArmazenamentoArquivos } from './s3-armazenamento-arquivos';

interface Configuracao {
  get(nome: string): string | undefined;
}

/** Cliente S3 pelas variáveis `S3_*` (ver `apps/api/.env.example`); `null` sem bucket. */
export function criarClienteS3(config: Configuracao): { s3: S3Client; bucket: string } | null {
  const bucket = config.get('S3_BUCKET');
  if (!bucket) return null;
  const s3 = new S3Client({
    endpoint: config.get('S3_ENDPOINT') || undefined,
    region: config.get('S3_REGIAO') || 'us-east-1',
    forcePathStyle: config.get('S3_FORCAR_PATH_STYLE') === 'true',
    credentials: {
      accessKeyId: config.get('S3_ACCESS_KEY_ID') ?? '',
      secretAccessKey: config.get('S3_SECRET_ACCESS_KEY') ?? '',
    },
  });
  return { s3, bucket };
}

const naoConfigurado = async (): Promise<never> => {
  throw new Error('Storage não configurado: defina S3_BUCKET e as chaves S3_* no apps/api/.env.');
};

/** Sem S3 configurado a API sobe (as telas sem arquivo funcionam), e o uso explica o que falta. */
export function criarArmazenamento(config: Configuracao): ArmazenamentoArquivos {
  const cliente = criarClienteS3(config);
  if (cliente) return new S3ArmazenamentoArquivos(cliente.s3, cliente.bucket);
  return {
    urlDeEnvio: naoConfigurado,
    urlDeDownload: naoConfigurado,
    metadados: naoConfigurado,
    ler: naoConfigurado,
    remover: naoConfigurado,
  };
}
