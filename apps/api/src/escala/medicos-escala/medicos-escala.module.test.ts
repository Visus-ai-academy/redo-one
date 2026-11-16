import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabaseModule } from '../../database/database.module';
import { MedicosEscalaController } from './medicos-escala.controller';
import { MedicosEscalaModule } from './medicos-escala.module';
import { MedicosEscalaService } from './medicos-escala.service';

describe('MedicosEscalaModule', () => {
  it('liga o controller e monta o service com o repositório', async () => {
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, MedicosEscalaModule],
    }).compile();

    expect(modulo.get(MedicosEscalaController)).toBeInstanceOf(MedicosEscalaController);
    expect(modulo.get(MedicosEscalaService)).toBeInstanceOf(MedicosEscalaService);
    await modulo.close();
  });
});
