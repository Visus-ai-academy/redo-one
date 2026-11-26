import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { DatabaseModule } from '../database/database.module';
import { GatilhosDistribuicaoModule } from '../distribuicao/infrastructure/catalogo/gatilhos-distribuicao.module';
import { AvisosCompartilhadosModule } from '../ingestao/infrastructure/avisos/avisos-compartilhados.module';
import { GatilhosIngestaoModule } from '../ingestao/infrastructure/jobs/gatilhos-ingestao.module';
import { CatalogoModule } from './catalogo.module';
import { ClientesController } from './clientes/clientes.controller';
import { ContratadosController } from './contratados/contratados.controller';
import { DeParaEspecialidadesController } from './de-para/de-para.controller';
import { DeParaService } from './de-para/de-para.service';
import { DE_PARA_ESPECIALIDADE, SUFIXOS_CLIENTE } from './de-para/tokens';
import { ExamesController } from './exames/exames.controller';
import { ModalidadesController, PrioridadesController } from './listas/listas.controller';
import { ListaService } from './listas/listas.service';
import { CATEGORIAS_EXAME, ESPECIALIDADES, MODALIDADES, PRIORIDADES } from './listas/tokens';
import { OpcoesController } from './opcoes/opcoes.controller';
import { SubespecialidadesController } from './subespecialidades/subespecialidades.controller';

const MODULOS = [
  ConfigModule.forRoot({ isGlobal: true }),
  DatabaseModule,
  AuditoriaModule,
  GatilhosIngestaoModule,
  AvisosCompartilhadosModule,
  GatilhosDistribuicaoModule,
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

    expect(modulo.get(SubespecialidadesController)).toBeInstanceOf(SubespecialidadesController);

    expect(modulo.get(ContratadosController)).toBeInstanceOf(ContratadosController);

    expect(modulo.get(ClientesController)).toBeInstanceOf(ClientesController);

    expect(modulo.get(ExamesController)).toBeInstanceOf(ExamesController);

    expect(modulo.get(DE_PARA_ESPECIALIDADE)).toBeInstanceOf(DeParaService);
    expect(modulo.get(SUFIXOS_CLIENTE)).toBeInstanceOf(DeParaService);
    expect(modulo.get(DeParaEspecialidadesController)).toBeInstanceOf(
      DeParaEspecialidadesController,
    );

    expect(modulo.get(OpcoesController)).toBeInstanceOf(OpcoesController);

    await modulo.close();
  });
});
