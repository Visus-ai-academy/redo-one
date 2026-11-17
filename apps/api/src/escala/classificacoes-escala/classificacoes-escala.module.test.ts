import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabaseModule } from '../../database/database.module';
import { ClassificacoesEscalaController } from './classificacoes-escala.controller';
import { ClassificacoesEscalaModule } from './classificacoes-escala.module';
import { ClassificacoesEscalaService } from './classificacoes-escala.service';

describe('ClassificacoesEscalaModule', () => {
  it('liga o controller e monta o service com o repositório', async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        ClassificacoesEscalaModule,
      ],
    }).compile();

    expect(modulo.get(ClassificacoesEscalaController)).toBeInstanceOf(
      ClassificacoesEscalaController,
    );
    expect(modulo.get(ClassificacoesEscalaService)).toBeInstanceOf(ClassificacoesEscalaService);
    await modulo.close();
  });
});
