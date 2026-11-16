import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AuditoriaModule } from '../../auditoria/auditoria.module';
import { DatabaseModule } from '../../database/database.module';
import { FrentesController } from '../frentes/frentes.controller';
import { FrentesService } from '../frentes/frentes.service';
import { TiposAusenciaController } from '../tipos-ausencia/tipos-ausencia.controller';
import { TiposAusenciaService } from '../tipos-ausencia/tipos-ausencia.service';
import { TIPOS_AUSENCIA_SERVICE } from '../tipos-ausencia/tokens';
import { TurnosController } from '../turnos/turnos.controller';
import { TurnosService } from '../turnos/turnos.service';
import { CadastrosEscalaModule } from './cadastros-escala.module';

describe('CadastrosEscalaModule', () => {
  it('liga os controllers e services de frentes, turnos e tipos de ausência', async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuditoriaModule,
        CadastrosEscalaModule,
      ],
    }).compile();

    expect(modulo.get(FrentesController)).toBeInstanceOf(FrentesController);
    expect(modulo.get(FrentesService)).toBeInstanceOf(FrentesService);
    expect(modulo.get(TurnosController)).toBeInstanceOf(TurnosController);
    expect(modulo.get(TurnosService)).toBeInstanceOf(TurnosService);
    expect(modulo.get(TiposAusenciaController)).toBeInstanceOf(TiposAusenciaController);
    expect(modulo.get(TIPOS_AUSENCIA_SERVICE)).toBeInstanceOf(TiposAusenciaService);

    await modulo.close();
  });
});
