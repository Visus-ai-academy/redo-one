import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { createOpenApiDocument } from './openapi/openapi';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Todo corpo, query e param passa pelo DTO: campo fora do DTO é recusado com 400.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  // Encerra o pool do Postgres (DatabaseModule.onApplicationShutdown) ao receber SIGTERM no deploy.
  app.enableShutdownHooks();
  // Atrás do proxy HTTPS da VPS, o IP real vem no X-Forwarded-For. Sem isto, o bloqueio por IP e o
  // registro de acessos veriam todo mundo com o IP do proxy. Ex.: TRUST_PROXY=loopback.
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy)
    app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

  // Origens liberadas para o front (ex.: http://localhost:5173), separadas por vírgula.
  const corsOrigin = config.get<string>('CORS_ORIGIN');
  app.enableCors({ origin: corsOrigin ? corsOrigin.split(',') : false, credentials: true });

  SwaggerModule.setup('docs', app, () => createOpenApiDocument(app));

  await app.listen(config.get<number>('PORT') ?? 3000);
}

void bootstrap();
