import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ComumModule } from '../comum/comum.module';
import { RegistroTarefas } from '../comum/jobs/registro-tarefas';
import { DatabaseModule } from '../database/database.module';
import { TAREFA_EXPURGAR_LINHAS_BRUTAS, TAREFA_IMPORTAR_LAUDOS } from './application/tarefas';
import { ConfirmarEnvio, PrepararEnvio } from './application/use-cases/envio-planilha';
import { ImportarLaudos } from './application/use-cases/importar-laudos';
import {
  AvisosController,
  ParametrosIngestaoController,
} from './infrastructure/http/avisos.controller';
import { ImportacoesController } from './infrastructure/http/importacoes.controller';
import { IngestaoModule } from './ingestao.module';

describe('IngestaoModule', () => {
  it('monta o caso de uso e registra a tarefa ingestao.importar na fila', async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({})] }),
        DatabaseModule,
        AuditoriaModule,
        ComumModule,
        IngestaoModule,
      ],
    }).compile();
    await modulo.init();

    expect(modulo.get(ImportarLaudos)).toBeInstanceOf(ImportarLaudos);
    expect(modulo.get(PrepararEnvio)).toBeInstanceOf(PrepararEnvio);
    expect(modulo.get(ConfirmarEnvio)).toBeInstanceOf(ConfirmarEnvio);
    expect(modulo.get(ImportacoesController)).toBeInstanceOf(ImportacoesController);
    expect(modulo.get(AvisosController)).toBeInstanceOf(AvisosController);
    expect(modulo.get(ParametrosIngestaoController)).toBeInstanceOf(ParametrosIngestaoController);
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
        AuditoriaModule,
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
