// Gera o openapi.json consumido pelo Kubb no apps/web, sem subir o servidor HTTP.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { createOpenApiDocument } from './openapi';

async function exportOpenApi() {
  // O export não acessa o banco (o pool só conecta na primeira query); a URL só satisfaz a config obrigatória.
  process.env.DATABASE_URL ??= 'postgresql://openapi-export@localhost/openapi';
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = createOpenApiDocument(app);
  writeFileSync(resolve(__dirname, '../../openapi.json'), `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

void exportOpenApi();
