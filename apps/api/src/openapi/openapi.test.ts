import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { CORTES_REPOSITORY } from '../faturamento/application/ports/cortes.repository';
import { CortesEmMemoria } from '../faturamento/testing/fakes';
import { createOpenApiDocument } from './openapi';

describe('createOpenApiDocument', () => {
  it('gera um documento OpenAPI 3 com título e versão da API', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Sem banco nos testes: o corte padrão inicial gravado ao subir vai para a memória.
      .overrideProvider(CORTES_REPOSITORY)
      .useValue(new CortesEmMemoria())
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const document = createOpenApiDocument(app);

    expect(document.openapi).toMatch(/^3\./);
    expect(document.info).toMatchObject({ title: 'One API', version: '0.0.0' });

    await app.close();
  });

  it('documenta o login (POST /sessao) com as respostas 201, 401 e 429', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Sem banco nos testes: o corte padrão inicial gravado ao subir vai para a memória.
      .overrideProvider(CORTES_REPOSITORY)
      .useValue(new CortesEmMemoria())
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const document = createOpenApiDocument(app);

    expect(Object.keys(document.paths['/sessao']?.post?.responses ?? {})).toEqual(
      expect.arrayContaining(['201', '401', '429']),
    );

    await app.close();
  });
});
