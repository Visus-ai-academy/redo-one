import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabaseModule } from '../../database/database.module';
import { HistoricoEscalaController } from './historico.controller';
import { HistoricoModule } from './historico.module';
import { HistoricoEscalaService } from './historico.service';

describe('HistoricoModule', () => {
  it('liga o controller e monta o service com os repositórios', async () => {
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, HistoricoModule],
    }).compile();

    expect(modulo.get(HistoricoEscalaController)).toBeInstanceOf(HistoricoEscalaController);
    expect(modulo.get(HistoricoEscalaService)).toBeInstanceOf(HistoricoEscalaService);
    await modulo.close();
  });
});
