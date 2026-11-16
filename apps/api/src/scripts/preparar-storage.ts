// Cria o bucket do storage de dev (RustFS do docker-compose) com o CORS das origens do front
// (CORS_ORIGIN). Pode rodar de novo. Uso: pnpm --filter @repo/api storage:preparar
// Em produção, o bucket e o CORS são configurados no provedor.
import { existsSync } from 'node:fs';

import { criarClienteS3 } from '../comum/armazenamento/criar-armazenamento';
import { prepararBucket } from '../comum/armazenamento/s3-armazenamento-arquivos';

async function prepararStorage() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const cliente = criarClienteS3({ get: (nome) => process.env[nome] });
  if (!cliente) {
    console.error('Defina S3_BUCKET e as chaves S3_* no apps/api/.env.');
    process.exitCode = 1;
    return;
  }
  const origens = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());
  await prepararBucket(cliente.s3, cliente.bucket, origens);
  console.log(`Bucket "${cliente.bucket}" pronto, com CORS para ${origens.join(', ')}.`);
  cliente.s3.destroy();
}

void prepararStorage();
