import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { createOpenApiDocument } from './openapi';

describe('createOpenApiDocument', () => {
  it('gera um documento OpenAPI 3 com título e versão da API', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const document = createOpenApiDocument(app);

    expect(document.openapi).toMatch(/^3\./);
    expect(document.info).toMatchObject({ title: 'One API', version: '0.0.0' });

    await app.close();
  });
});
