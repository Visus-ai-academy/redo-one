import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { DatabaseModule } from '../database/database.module';
import { CatalogoModule } from './catalogo.module';
import { ModalidadesController, PrioridadesController } from './listas/listas.controller';
import { ListaService } from './listas/listas.service';
import { CATEGORIAS_EXAME, ESPECIALIDADES, MODALIDADES, PRIORIDADES } from './listas/tokens';

const MODULOS = [
  ConfigModule.forRoot({ isGlobal: true }),
  DatabaseModule,
  AuditoriaModule,
  CatalogoModule,
];

describe('CatalogoModule', () => {
  it('monta um ListaService por lista e liga os controllers', async () => {
    const modulo = await Test.createTestingModule({ imports: MODULOS }).compile();

    for (const token of [MODALIDADES, ESPECIALIDADES, CATEGORIAS_EXAME, PRIORIDADES]) {
      expect(modulo.get(token)).toBeInstanceOf(ListaService);
    }
    expect(modulo.get(MODALIDADES)).not.toBe(modulo.get(PRIORIDADES));
    expect(modulo.get(ModalidadesController)).toBeInstanceOf(ModalidadesController);
    expect(modulo.get(PrioridadesController)).toBeInstanceOf(PrioridadesController);

    await modulo.close();
  });
});
