import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { ComumModule } from '../comum/comum.module';
import { RegistroTarefas } from '../comum/jobs/registro-tarefas';
import { DatabaseModule } from '../database/database.module';
import { ImportarLaudos } from './application/use-cases/importar-laudos';
import {
  IngestaoModule,
  TAREFA_EXPURGAR_LINHAS_BRUTAS,
  TAREFA_IMPORTAR_LAUDOS,
} from './ingestao.module';

describe('IngestaoModule', () => {
  it('monta o caso de uso e registra a tarefa ingestao.importar na fila', async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({})] }),
        DatabaseModule,
        ComumModule,
        IngestaoModule,
      ],
    }).compile();
    await modulo.init();

    expect(modulo.get(ImportarLaudos)).toBeInstanceOf(ImportarLaudos);
    expect(Object.keys(modulo.get(RegistroTarefas).listar())).toContain(TAREFA_IMPORTAR_LAUDOS);
    expect(modulo.get(RegistroTarefas).agenda()).toContain(
      `0 4 * * * ${TAREFA_EXPURGAR_LINHAS_BRUTAS}`,
    );

    await modulo.close();
  });

  it('a tarefa recusa payload sem importacaoId', async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({})] }),
        DatabaseModule,
        ComumModule,
        IngestaoModule,
      ],
    }).compile();
    await modulo.init();

    const tarefa = modulo.get(RegistroTarefas).listar()[TAREFA_IMPORTAR_LAUDOS];
    await expect(tarefa?.({})).rejects.toThrow('payload inválido');

    await modulo.close();
  });
});
