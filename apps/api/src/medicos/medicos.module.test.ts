import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ListaService } from '../catalogo/listas/listas.service';
import { DatabaseModule } from '../database/database.module';
import { GatilhosTipificacaoModule } from '../faturamento/infrastructure/jobs/gatilhos-tipificacao.module';
import { MedicosController } from './cadastro/medicos.controller';
import { EquipesController } from './equipes/equipes.controller';
import { EquipesService } from './equipes/equipes.service';
import { MedicosModule } from './medicos.module';
import { NiveisMedicoController } from './niveis/niveis.controller';
import { NIVEIS_MEDICO_SERVICE } from './niveis/tokens';

describe('MedicosModule', () => {
  it('liga os controllers e monta os services de níveis e equipes', async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AuditoriaModule,
        GatilhosTipificacaoModule,
        MedicosModule,
      ],
    }).compile();

    expect(modulo.get(MedicosController)).toBeInstanceOf(MedicosController);
    expect(modulo.get(EquipesController)).toBeInstanceOf(EquipesController);
    expect(modulo.get(NiveisMedicoController)).toBeInstanceOf(NiveisMedicoController);
    expect(modulo.get(NIVEIS_MEDICO_SERVICE)).toBeInstanceOf(ListaService);
    expect(modulo.get(EquipesService)).toBeInstanceOf(EquipesService);
  });
});
