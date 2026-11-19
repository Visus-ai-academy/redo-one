import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { parseCrontab } from 'graphile-worker';
import { describe, expect, it } from 'vitest';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ComumModule } from '../comum/comum.module';
import { RegistroTarefas } from '../comum/jobs/registro-tarefas';
import { DatabaseModule } from '../database/database.module';
import { RELATORIO_MOBILEMED } from './application/ports/relatorio-mobilemed';
import {
  TAREFA_AGENDAR_MOBILEMED,
  TAREFA_EXPURGAR_LINHAS_BRUTAS,
  TAREFA_IMPORTAR_LAUDOS,
} from './application/tarefas';
import { ConfirmarEnvio, PrepararEnvio } from './application/use-cases/envio-planilha';
import { ImportarLaudos } from './application/use-cases/importar-laudos';
import {
  AvisosController,
  ParametrosIngestaoController,
} from './infrastructure/http/avisos.controller';
import { ImportacoesController } from './infrastructure/http/importacoes.controller';
import {
  RelatorioMobileMedDesligado,
  RelatorioMobileMedFake,
} from './infrastructure/mobilemed/relatorio-mobilemed-fake';
import { RelatorioMobileMedHttp } from './infrastructure/mobilemed/relatorio-mobilemed-http';
import { IngestaoModule } from './ingestao.module';

async function montar(env: Record<string, string>) {
  const modulo = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => env] }),
      DatabaseModule,
      AuditoriaModule,
      ComumModule,
      IngestaoModule,
    ],
  }).compile();
  await modulo.init();
  return modulo;
}

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
    expect(modulo.get(RegistroTarefas).agenda()).toContain(`* * * * * ${TAREFA_AGENDAR_MOBILEMED}`);
    // O trabalhador recusa subir com crontab inválido (ex.: ponto no nome da tarefa).
    expect(() => parseCrontab(modulo.get(RegistroTarefas).agenda())).not.toThrow();

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

  it.each([
    [{}, RelatorioMobileMedDesligado],
    [{ INGESTAO_MOBILEMED: 'fake' }, RelatorioMobileMedFake],
    [{ INGESTAO_MOBILEMED: 'real' }, RelatorioMobileMedHttp],
  ])('a MobileMed da ingestão segue INGESTAO_MOBILEMED (%o)', async (env, classe) => {
    const modulo = await montar(env);

    expect(modulo.get(RELATORIO_MOBILEMED)).toBeInstanceOf(classe);

    await modulo.close();
  });
});
