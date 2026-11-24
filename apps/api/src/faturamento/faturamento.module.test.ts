import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { DatabaseModule } from '../database/database.module';
import { COMPETENCIAS_BLOQUEADAS } from '../ingestao/application/ports/competencias-bloqueadas';
import { CORTES_COMPETENCIA } from '../ingestao/application/ports/cortes-competencia';
import { CORTE_PADRAO_INICIAL } from '../ingestao/domain/competencia';
import { COMPETENCIAS_REPOSITORY } from './application/ports/competencias.repository';
import { CORTES_REPOSITORY } from './application/ports/cortes.repository';
import { CriarCorte } from './application/use-cases/criar-corte';
import { FecharCompetencia } from './application/use-cases/fechar-competencia';
import { FaturamentoModule } from './faturamento.module';
import { CompetenciasEmMemoria, CortesEmMemoria } from './testing/fakes';

describe('FaturamentoModule', () => {
  it('liga as portas da ingestão aos repositórios e grava o corte padrão inicial ao subir', async () => {
    const cortes = new CortesEmMemoria();
    const competencias = new CompetenciasEmMemoria();
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({})] }),
        DatabaseModule,
        AuditoriaModule,
        FaturamentoModule,
      ],
    })
      .overrideProvider(CORTES_REPOSITORY)
      .useValue(cortes)
      .overrideProvider(COMPETENCIAS_REPOSITORY)
      .useValue(competencias)
      .compile();
    await modulo.init();

    expect(modulo.get(CORTES_COMPETENCIA)).toBe(cortes);
    expect(modulo.get(COMPETENCIAS_BLOQUEADAS)).toBe(competencias);
    expect(cortes.padrao).toEqual([CORTE_PADRAO_INICIAL]);
    expect(modulo.get(FecharCompetencia)).toBeInstanceOf(FecharCompetencia);
    expect(modulo.get(CriarCorte)).toBeInstanceOf(CriarCorte);

    await modulo.close();
  });
});
