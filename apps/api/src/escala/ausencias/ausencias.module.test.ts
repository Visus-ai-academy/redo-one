import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabaseModule } from '../../database/database.module';
import { AusenciasController } from './ausencias.controller';
import { AusenciasModule } from './ausencias.module';
import { AusenciasService } from './ausencias.service';
import { PortalAusenciasController } from './portal-ausencias.controller';
import { PortalAusenciasService } from './portal-ausencias.service';

describe('AusenciasModule', () => {
  it('liga os controllers e monta os services com os repositórios', async () => {
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AusenciasModule],
    }).compile();

    expect(modulo.get(AusenciasController)).toBeInstanceOf(AusenciasController);
    expect(modulo.get(PortalAusenciasController)).toBeInstanceOf(PortalAusenciasController);
    expect(modulo.get(AusenciasService)).toBeInstanceOf(AusenciasService);
    expect(modulo.get(PortalAusenciasService)).toBeInstanceOf(PortalAusenciasService);
    await modulo.close();
  });
});
