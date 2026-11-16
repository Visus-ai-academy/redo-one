import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabaseModule } from '../../database/database.module';
import { EscalaFixaController } from './escala-fixa.controller';
import { EscalaFixaModule } from './escala-fixa.module';
import { EscalaFixaService } from './escala-fixa.service';

describe('EscalaFixaModule', () => {
  it('liga o controller e monta o service com a consulta de ocorrências', async () => {
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, EscalaFixaModule],
    }).compile();

    expect(modulo.get(EscalaFixaController)).toBeInstanceOf(EscalaFixaController);
    expect(modulo.get(EscalaFixaService)).toBeInstanceOf(EscalaFixaService);
    await modulo.close();
  });
});
