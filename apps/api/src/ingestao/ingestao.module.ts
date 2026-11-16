import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ARMAZENAMENTO_ARQUIVOS,
  type ArmazenamentoArquivos,
} from '../comum/armazenamento/armazenamento-arquivos';
import { RegistroTarefas } from '../comum/jobs/registro-tarefas';
import {
  ARQUIVOS_REPOSITORY,
  type ArquivosRepository,
} from './application/ports/arquivos.repository';
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
  LINHAS_BRUTAS_REPOSITORY,
  type LinhasBrutasRepository,
} from './application/ports/linhas-brutas.repository';
import {
  PARAMETROS_INGESTAO_REPOSITORY,
  type ParametrosIngestaoRepository,
} from './application/ports/parametros-ingestao.repository';
import { PSEUDONIMIZADOR, type Pseudonimizador } from './application/ports/pseudonimizador';
import { TAREFA_EXPURGAR_LINHAS_BRUTAS, TAREFA_IMPORTAR_LAUDOS } from './application/tarefas';
import { ConfirmarEnvio, PrepararEnvio } from './application/use-cases/envio-planilha';
import { ExpurgarLinhasBrutas } from './application/use-cases/expurgar-linhas-brutas';
import { ImportarLaudos } from './application/use-cases/importar-laudos';
import { ImportacoesController } from './infrastructure/http/importacoes.controller';
import { DrizzleArquivosRepository } from './infrastructure/persistence/drizzle-arquivos.repository';
import { DrizzleAvisosCadastroRepository } from './infrastructure/persistence/drizzle-avisos-cadastro.repository';
import { DrizzleCadastrosIngestao } from './infrastructure/persistence/drizzle-cadastros-ingestao';
import { DrizzleImportacoesRepository } from './infrastructure/persistence/drizzle-importacoes.repository';
import { DrizzleLaudosRepository } from './infrastructure/persistence/drizzle-laudos.repository';
import { DrizzleLinhasBrutasRepository } from './infrastructure/persistence/drizzle-linhas-brutas.repository';
import { DrizzleParametrosIngestaoRepository } from './infrastructure/persistence/drizzle-parametros-ingestao.repository';
import { SemCompetenciasBloqueadas } from './infrastructure/persistence/sem-competencias-bloqueadas';
import { HmacPseudonimizador } from './infrastructure/seguranca/hmac-pseudonimizador';
import { XlsxLeitorPlanilha } from './infrastructure/xlsx/xlsx-leitor-planilha';

/** Contexto `ingestao` (hexagonal): importação dos laudos da MobileMed. */
@Module({
  controllers: [ImportacoesController],
  providers: [
    { provide: ARQUIVOS_REPOSITORY, useClass: DrizzleArquivosRepository },
    {
      provide: PrepararEnvio,
      inject: [ARQUIVOS_REPOSITORY, ARMAZENAMENTO_ARQUIVOS],
      useFactory: (arquivos: ArquivosRepository, armazenamento: ArmazenamentoArquivos) =>
        new PrepararEnvio(arquivos, armazenamento, () => new Date()),
    },
    {
      provide: ConfirmarEnvio,
      inject: [ARQUIVOS_REPOSITORY, IMPORTACOES_REPOSITORY, ARMAZENAMENTO_ARQUIVOS],
      useFactory: (
        arquivos: ArquivosRepository,
        importacoes: ImportacoesRepository,
        armazenamento: ArmazenamentoArquivos,
      ) => new ConfirmarEnvio(arquivos, importacoes, armazenamento, () => new Date()),
    },
    { provide: IMPORTACOES_REPOSITORY, useClass: DrizzleImportacoesRepository },
    { provide: LAUDOS_REPOSITORY, useClass: DrizzleLaudosRepository },
    { provide: AVISOS_CADASTRO_REPOSITORY, useClass: DrizzleAvisosCadastroRepository },
    { provide: PARAMETROS_INGESTAO_REPOSITORY, useClass: DrizzleParametrosIngestaoRepository },
    { provide: CADASTROS_INGESTAO, useClass: DrizzleCadastrosIngestao },
    { provide: COMPETENCIAS_BLOQUEADAS, useClass: SemCompetenciasBloqueadas },
    { provide: LEITOR_PLANILHA, useClass: XlsxLeitorPlanilha },
    { provide: LINHAS_BRUTAS_REPOSITORY, useClass: DrizzleLinhasBrutasRepository },
    {
      provide: ExpurgarLinhasBrutas,
      inject: [PARAMETROS_INGESTAO_REPOSITORY, LINHAS_BRUTAS_REPOSITORY],
      useFactory: (parametros: ParametrosIngestaoRepository, linhas: LinhasBrutasRepository) =>
        new ExpurgarLinhasBrutas(parametros, linhas, () => new Date()),
    },
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
    private readonly expurgarLinhasBrutas: ExpurgarLinhasBrutas,
  ) {}

  onModuleInit() {
    this.registro.registrar(TAREFA_IMPORTAR_LAUDOS, async (payload) => {
      const id = (payload as { importacaoId?: unknown } | null)?.importacaoId;
      if (typeof id !== 'string') throw new Error(`${TAREFA_IMPORTAR_LAUDOS}: payload inválido`);
      await this.importarLaudos.executar(id);
    });
    this.registro.registrar(TAREFA_EXPURGAR_LINHAS_BRUTAS, async () => {
      await this.expurgarLinhasBrutas.executar();
    });
    // Todo dia às 04:00 no fuso do servidor (em UTC, 01:00 em Brasília), fora do horário de uso.
    this.registro.agendar(TAREFA_EXPURGAR_LINHAS_BRUTAS, '0 4 * * *');
  }
}
