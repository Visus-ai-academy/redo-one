import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ARMAZENAMENTO_ARQUIVOS,
  type ArmazenamentoArquivos,
} from '../comum/armazenamento/armazenamento-arquivos';
import { RegistroTarefas } from '../comum/jobs/registro-tarefas';
import {
  AVISOS_CADASTRO_REPOSITORY,
  type AvisosCadastroRepository,
} from './application/ports/avisos-cadastro.repository';
import {
  CADASTROS_INGESTAO,
  type LeitorCadastrosIngestao,
} from './application/ports/cadastros-ingestao';
import {
  COMPETENCIAS_BLOQUEADAS,
  type CompetenciasBloqueadas,
} from './application/ports/competencias-bloqueadas';
import {
  IMPORTACOES_REPOSITORY,
  type ImportacoesRepository,
} from './application/ports/importacoes.repository';
import { LAUDOS_REPOSITORY, type LaudosRepository } from './application/ports/laudos.repository';
import { LEITOR_PLANILHA, type LeitorPlanilha } from './application/ports/leitor-planilha';
import {
  PARAMETROS_INGESTAO_REPOSITORY,
  type ParametrosIngestaoRepository,
} from './application/ports/parametros-ingestao.repository';
import { PSEUDONIMIZADOR, type Pseudonimizador } from './application/ports/pseudonimizador';
import { ImportarLaudos } from './application/use-cases/importar-laudos';
import { DrizzleAvisosCadastroRepository } from './infrastructure/persistence/drizzle-avisos-cadastro.repository';
import { DrizzleCadastrosIngestao } from './infrastructure/persistence/drizzle-cadastros-ingestao';
import { DrizzleImportacoesRepository } from './infrastructure/persistence/drizzle-importacoes.repository';
import { DrizzleLaudosRepository } from './infrastructure/persistence/drizzle-laudos.repository';
import { DrizzleParametrosIngestaoRepository } from './infrastructure/persistence/drizzle-parametros-ingestao.repository';
import { SemCompetenciasBloqueadas } from './infrastructure/persistence/sem-competencias-bloqueadas';
import { HmacPseudonimizador } from './infrastructure/seguranca/hmac-pseudonimizador';
import { XlsxLeitorPlanilha } from './infrastructure/xlsx/xlsx-leitor-planilha';

/** Tarefa da fila que processa uma importação; payload `{ importacaoId }`. */
export const TAREFA_IMPORTAR_LAUDOS = 'ingestao.importar';

/** Fila própria: uma importação por vez, na ordem em que chegaram. */
export const FILA_INGESTAO = 'ingestao';

/** Contexto `ingestao` (hexagonal): importação dos laudos da MobileMed. */
@Module({
  providers: [
    { provide: IMPORTACOES_REPOSITORY, useClass: DrizzleImportacoesRepository },
    { provide: LAUDOS_REPOSITORY, useClass: DrizzleLaudosRepository },
    { provide: AVISOS_CADASTRO_REPOSITORY, useClass: DrizzleAvisosCadastroRepository },
    { provide: PARAMETROS_INGESTAO_REPOSITORY, useClass: DrizzleParametrosIngestaoRepository },
    { provide: CADASTROS_INGESTAO, useClass: DrizzleCadastrosIngestao },
    { provide: COMPETENCIAS_BLOQUEADAS, useClass: SemCompetenciasBloqueadas },
    { provide: LEITOR_PLANILHA, useClass: XlsxLeitorPlanilha },
    {
      provide: PSEUDONIMIZADOR,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new HmacPseudonimizador(config.get<string>('PACIENTE_HMAC_SEGREDO') ?? ''),
    },
    {
      provide: ImportarLaudos,
      inject: [
        IMPORTACOES_REPOSITORY,
        ARMAZENAMENTO_ARQUIVOS,
        LEITOR_PLANILHA,
        CADASTROS_INGESTAO,
        COMPETENCIAS_BLOQUEADAS,
        LAUDOS_REPOSITORY,
        AVISOS_CADASTRO_REPOSITORY,
        PARAMETROS_INGESTAO_REPOSITORY,
        PSEUDONIMIZADOR,
      ],
      useFactory: (
        importacoes: ImportacoesRepository,
        armazenamento: ArmazenamentoArquivos,
        leitor: LeitorPlanilha,
        cadastros: LeitorCadastrosIngestao,
        competencias: CompetenciasBloqueadas,
        laudos: LaudosRepository,
        avisos: AvisosCadastroRepository,
        parametros: ParametrosIngestaoRepository,
        pseudonimizador: Pseudonimizador,
      ) =>
        new ImportarLaudos(
          importacoes,
          armazenamento,
          leitor,
          cadastros,
          competencias,
          laudos,
          avisos,
          parametros,
          pseudonimizador,
          () => new Date(),
        ),
    },
  ],
})
export class IngestaoModule implements OnModuleInit {
  constructor(
    private readonly registro: RegistroTarefas,
    private readonly importarLaudos: ImportarLaudos,
  ) {}

  onModuleInit() {
    this.registro.registrar(TAREFA_IMPORTAR_LAUDOS, async (payload) => {
      const id = (payload as { importacaoId?: unknown } | null)?.importacaoId;
      if (typeof id !== 'string') throw new Error(`${TAREFA_IMPORTAR_LAUDOS}: payload inválido`);
      await this.importarLaudos.executar(id);
    });
  }
}
