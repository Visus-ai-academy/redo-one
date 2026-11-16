import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DatabaseModule } from '../../database/database.module';
import { AjustesProdutividadeService } from './ajustes.service';
import { AlocacoesController, CoberturasController } from './alocacoes.controller';
import { AlocacoesModule } from './alocacoes.module';
import { AlocacoesService } from './alocacoes.service';

describe('AlocacoesModule', () => {
  it('liga os controllers e monta os services com a consulta de ocorrências', async () => {
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, AlocacoesModule],
    }).compile();

    expect(modulo.get(AlocacoesController)).toBeInstanceOf(AlocacoesController);
    expect(modulo.get(CoberturasController)).toBeInstanceOf(CoberturasController);
    expect(modulo.get(AlocacoesService)).toBeInstanceOf(AlocacoesService);
    expect(modulo.get(AjustesProdutividadeService)).toBeInstanceOf(AjustesProdutividadeService);
    await modulo.close();
  });
});
