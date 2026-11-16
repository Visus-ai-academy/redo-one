import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabaseModule } from '../../database/database.module';
import { ConsultaOcorrenciasEscala, OCORRENCIAS_ESCALA } from './consulta-ocorrencias';
import { MinhaEscalaController } from './minha-escala.controller';
import { OcorrenciasController } from './ocorrencias.controller';
import { OcorrenciasModule } from './ocorrencias.module';

describe('OcorrenciasModule', () => {
  it('liga os controllers e exporta a consulta de ocorrências', async () => {
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, OcorrenciasModule],
    }).compile();

    expect(modulo.get(OcorrenciasController)).toBeInstanceOf(OcorrenciasController);
    expect(modulo.get(MinhaEscalaController)).toBeInstanceOf(MinhaEscalaController);
    expect(modulo.get(OCORRENCIAS_ESCALA)).toBeInstanceOf(ConsultaOcorrenciasEscala);
    await modulo.close();
  });
});
