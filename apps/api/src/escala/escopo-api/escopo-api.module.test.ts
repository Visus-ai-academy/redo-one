import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AuditoriaModule } from '../../auditoria/auditoria.module';
import { DatabaseModule } from '../../database/database.module';
import { EscopoApiController } from './escopo-api.controller';
import { EscopoApiModule } from './escopo-api.module';
import { EscopoApiService } from './escopo-api.service';

describe('EscopoApiModule', () => {
  it('liga o controller e monta o service com os repositórios', async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuditoriaModule,
        EscopoApiModule,
      ],
    }).compile();

    expect(modulo.get(EscopoApiController)).toBeInstanceOf(EscopoApiController);
    expect(modulo.get(EscopoApiService)).toBeInstanceOf(EscopoApiService);
    await modulo.close();
  });
});
