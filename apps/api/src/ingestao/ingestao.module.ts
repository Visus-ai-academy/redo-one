import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import {
  ARMAZENAMENTO_ARQUIVOS,
  type ArmazenamentoArquivos,
} from '../comum/armazenamento/armazenamento-arquivos';
import { RegistroTarefas } from '../comum/jobs/registro-tarefas';
import { ClienteMobileMed } from '../comum/mobilemed/cliente-mobilemed';
import { TOKEN_MOBILEMED, type TokenMobileMed } from '../comum/mobilemed/token-mobilemed';
import { FaturamentoModule } from '../faturamento/faturamento.module';
import {
  ARQUIVOS_REPOSITORY,
  type ArquivosRepository,
} from './application/ports/arquivos.repository';
import { CONSULTA_AVISOS, type ConsultaAvisos } from './application/ports/avisos.consulta';
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
  CONSULTA_IMPORTACOES,
  type ConsultaImportacoes,
} from './application/ports/consulta-importacoes';
import {
  CORTES_COMPETENCIA,
  type LeitorCortesCompetencia,
} from './application/ports/cortes-competencia';
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
import { PACIENTES_LAUDOS, type PacientesLaudos } from './application/ports/pacientes-laudos';
import {
  PARAMETROS_INGESTAO_REPOSITORY,
  type ParametrosIngestaoRepository,
} from './application/ports/parametros-ingestao.repository';
import { PSEUDONIMIZADOR, type Pseudonimizador } from './application/ports/pseudonimizador';
import {
  RELATORIO_MOBILEMED,
  type RelatorioMobileMed,
} from './application/ports/relatorio-mobilemed';
import {
  TAREFA_AGENDAR_MOBILEMED,
  TAREFA_EXPURGAR_LINHAS_BRUTAS,
  TAREFA_IMPORTAR_LAUDOS,
  TAREFA_RECALCULAR_COMPETENCIAS,
} from './application/tarefas';
import { AtualizarParametros } from './application/use-cases/atualizar-parametros';
import { ConsultarImportacoes } from './application/use-cases/consultar-importacoes';
import { ListarAvisos, ObterParametros } from './application/use-cases/consultas-simples';
import { CriarImportacaoMobileMed } from './application/use-cases/criar-importacao-mobilemed';
import { ConfirmarEnvio, PrepararEnvio } from './application/use-cases/envio-planilha';
import { ExpurgarLinhasBrutas } from './application/use-cases/expurgar-linhas-brutas';
import { ImportarLaudos } from './application/use-cases/importar-laudos';
import { LerPacientesDosLaudos } from './application/use-cases/ler-pacientes-dos-laudos';
import { RecalcularCompetencias } from './application/use-cases/recalcular-competencias';
import { TriarAviso } from './application/use-cases/triar-aviso';
import {
  AvisosController,
  ParametrosIngestaoController,
} from './infrastructure/http/avisos.controller';
import { ImportacaoMobileMedController } from './infrastructure/http/importacao-mobilemed.controller';
import { ImportacoesController } from './infrastructure/http/importacoes.controller';
import {
  RelatorioMobileMedDesligado,
  RelatorioMobileMedFake,
} from './infrastructure/mobilemed/relatorio-mobilemed-fake';
import { RelatorioMobileMedHttp } from './infrastructure/mobilemed/relatorio-mobilemed-http';
import { DrizzleArquivosRepository } from './infrastructure/persistence/drizzle-arquivos.repository';
import { DrizzleAvisosCadastroRepository } from './infrastructure/persistence/drizzle-avisos-cadastro.repository';
import { DrizzleCadastrosIngestao } from './infrastructure/persistence/drizzle-cadastros-ingestao';
import { DrizzleConsultaAvisos } from './infrastructure/persistence/drizzle-consulta-avisos';
import { DrizzleConsultaImportacoes } from './infrastructure/persistence/drizzle-consulta-importacoes';
import { DrizzleImportacoesRepository } from './infrastructure/persistence/drizzle-importacoes.repository';
import { DrizzleLaudosRepository } from './infrastructure/persistence/drizzle-laudos.repository';
import { DrizzleLinhasBrutasRepository } from './infrastructure/persistence/drizzle-linhas-brutas.repository';
import { DrizzlePacientesLaudos } from './infrastructure/persistence/drizzle-pacientes-laudos';
import { DrizzleParametrosIngestaoRepository } from './infrastructure/persistence/drizzle-parametros-ingestao.repository';
import { HmacPseudonimizador } from './infrastructure/seguranca/hmac-pseudonimizador';
import { XlsxLeitorPlanilha } from './infrastructure/xlsx/xlsx-leitor-planilha';

/** `INGESTAO_MOBILEMED`: vazio = desligada; `fake` = relatório vazio; `real` = a MobileMed. */
const modoMobileMed = (config: ConfigService) => config.get<string>('INGESTAO_MOBILEMED') || null;

/** Inteiro da variável de ambiente (já validada na subida) ou o padrão. */
const inteiro = (config: ConfigService, nome: string, padrao: number) => {
  const v = config.get<string>(nome);
  return v ? Number(v) : padrao;
};

/** Contexto `ingestao` (hexagonal): importação dos laudos da MobileMed. */
@Module({
  // Competências bloqueadas e cortes vêm do `faturamento`.
  imports: [FaturamentoModule],
  controllers: [
    ImportacoesController,
    ImportacaoMobileMedController,
    AvisosController,
    ParametrosIngestaoController,
  ],
  providers: [
    { provide: CONSULTA_AVISOS, useClass: DrizzleConsultaAvisos },
    {
      provide: ListarAvisos,
      inject: [CONSULTA_AVISOS],
      useFactory: (avisos: ConsultaAvisos) => new ListarAvisos(avisos),
    },
    {
      provide: TriarAviso,
      inject: [CONSULTA_AVISOS, AUDITORIA],
      useFactory: (avisos: ConsultaAvisos, auditoria: Auditoria) =>
        new TriarAviso(avisos, auditoria, () => new Date()),
    },
    {
      provide: ObterParametros,
      inject: [PARAMETROS_INGESTAO_REPOSITORY],
      useFactory: (parametros: ParametrosIngestaoRepository) => new ObterParametros(parametros),
    },
    {
      provide: AtualizarParametros,
      inject: [PARAMETROS_INGESTAO_REPOSITORY, AUDITORIA],
      useFactory: (parametros: ParametrosIngestaoRepository, auditoria: Auditoria) =>
        new AtualizarParametros(parametros, auditoria, () => new Date()),
    },
    { provide: ARQUIVOS_REPOSITORY, useClass: DrizzleArquivosRepository },
    { provide: CONSULTA_IMPORTACOES, useClass: DrizzleConsultaImportacoes },
    {
      provide: ConsultarImportacoes,
      inject: [CONSULTA_IMPORTACOES, ARMAZENAMENTO_ARQUIVOS, AUDITORIA],
      useFactory: (
        consulta: ConsultaImportacoes,
        armazenamento: ArmazenamentoArquivos,
        auditoria: Auditoria,
      ) => new ConsultarImportacoes(consulta, armazenamento, auditoria, () => new Date()),
    },
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
    { provide: LEITOR_PLANILHA, useClass: XlsxLeitorPlanilha },
    { provide: LINHAS_BRUTAS_REPOSITORY, useClass: DrizzleLinhasBrutasRepository },
    // Nome e código do paciente: só por este caso de uso (permissão + auditoria). Exportado para
    // as telas de faturamento, pré-pago, qualidade e pendências; nenhuma o usa ainda.
    { provide: PACIENTES_LAUDOS, useClass: DrizzlePacientesLaudos },
    {
      provide: LerPacientesDosLaudos,
      inject: [PACIENTES_LAUDOS, AUDITORIA],
      useFactory: (pacientes: PacientesLaudos, auditoria: Auditoria) =>
        new LerPacientesDosLaudos(pacientes, auditoria, () => new Date()),
    },
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
      provide: RELATORIO_MOBILEMED,
      inject: [ConfigService, TOKEN_MOBILEMED],
      useFactory: (config: ConfigService, token: TokenMobileMed): RelatorioMobileMed => {
        const modo = modoMobileMed(config);
        if (modo === 'fake') return new RelatorioMobileMedFake();
        if (modo !== 'real') return new RelatorioMobileMedDesligado();
        return new RelatorioMobileMedHttp(
          new ClienteMobileMed({
            baseUrl: (
              config.get<string>('MOBILEMED_REPORTS_API_URL') ||
              'https://gateway-sa.mobilemed.com.br/reports-api'
            ).replace(/\/+$/, ''),
            // O mesmo token da distribuição: um login só para o processo.
            token,
            timeoutMs: inteiro(config, 'MOBILEMED_TIMEOUT_MS', 90_000),
            // Uma chamada por vez: o relatório é pesado para a MobileMed.
            concorrencia: 1,
            limiteAnomalias: inteiro(config, 'MOBILEMED_LIMITE_ANOMALIAS', 2),
          }),
        );
      },
    },
    {
      provide: RecalcularCompetencias,
      inject: [LAUDOS_REPOSITORY, COMPETENCIAS_BLOQUEADAS, CORTES_COMPETENCIA],
      useFactory: (
        laudos: LaudosRepository,
        competencias: CompetenciasBloqueadas,
        cortes: LeitorCortesCompetencia,
      ) => new RecalcularCompetencias(laudos, competencias, cortes, () => new Date()),
    },
    {
      provide: CriarImportacaoMobileMed,
      inject: [IMPORTACOES_REPOSITORY, PARAMETROS_INGESTAO_REPOSITORY, ConfigService],
      useFactory: (
        importacoes: ImportacoesRepository,
        parametros: ParametrosIngestaoRepository,
        config: ConfigService,
      ) =>
        new CriarImportacaoMobileMed(
          importacoes,
          parametros,
          modoMobileMed(config) !== null,
          () => new Date(),
        ),
    },
    {
      provide: ImportarLaudos,
      inject: [
        IMPORTACOES_REPOSITORY,
        ARMAZENAMENTO_ARQUIVOS,
        LEITOR_PLANILHA,
        CADASTROS_INGESTAO,
        COMPETENCIAS_BLOQUEADAS,
        CORTES_COMPETENCIA,
        LAUDOS_REPOSITORY,
        AVISOS_CADASTRO_REPOSITORY,
        PARAMETROS_INGESTAO_REPOSITORY,
        PSEUDONIMIZADOR,
        RELATORIO_MOBILEMED,
      ],
      useFactory: (
        importacoes: ImportacoesRepository,
        armazenamento: ArmazenamentoArquivos,
        leitor: LeitorPlanilha,
        cadastros: LeitorCadastrosIngestao,
        competencias: CompetenciasBloqueadas,
        cortes: LeitorCortesCompetencia,
        laudos: LaudosRepository,
        avisos: AvisosCadastroRepository,
        parametros: ParametrosIngestaoRepository,
        pseudonimizador: Pseudonimizador,
        relatorio: RelatorioMobileMed,
      ) =>
        new ImportarLaudos(
          importacoes,
          armazenamento,
          leitor,
          cadastros,
          competencias,
          cortes,
          laudos,
          avisos,
          parametros,
          pseudonimizador,
          relatorio,
          () => new Date(),
        ),
    },
  ],
  exports: [LerPacientesDosLaudos],
})
export class IngestaoModule implements OnModuleInit {
  constructor(
    private readonly registro: RegistroTarefas,
    private readonly importarLaudos: ImportarLaudos,
    private readonly expurgarLinhasBrutas: ExpurgarLinhasBrutas,
    private readonly criarImportacaoMobileMed: CriarImportacaoMobileMed,
    private readonly recalcularCompetencias: RecalcularCompetencias,
  ) {}

  onModuleInit() {
    this.registro.registrar(TAREFA_IMPORTAR_LAUDOS, async (payload) => {
      const id = (payload as { importacaoId?: unknown } | null)?.importacaoId;
      if (typeof id !== 'string') throw new Error(`${TAREFA_IMPORTAR_LAUDOS}: payload inválido`);
      await this.importarLaudos.executar(id);
    });
    this.registro.registrar(TAREFA_RECALCULAR_COMPETENCIAS, async (payload) => {
      const ids = (payload as { clienteIds?: unknown } | null)?.clienteIds;
      const valido =
        ids === null || (Array.isArray(ids) && ids.every((id) => typeof id === 'string'));
      if (!valido) throw new Error(`${TAREFA_RECALCULAR_COMPETENCIAS}: payload inválido`);
      await this.recalcularCompetencias.executar({ clienteIds: ids as string[] | null });
    });
    this.registro.registrar(TAREFA_EXPURGAR_LINHAS_BRUTAS, async () => {
      await this.expurgarLinhasBrutas.executar();
    });
    // Todo dia às 04:00 no fuso do servidor (em UTC, 01:00 em Brasília), fora do horário de uso.
    this.registro.agendar(TAREFA_EXPURGAR_LINHAS_BRUTAS, '0 4 * * *');
    // A cada minuto confere o intervalo de `parametros_ingestao` (editável por tela, sem deploy).
    this.registro.registrar(TAREFA_AGENDAR_MOBILEMED, async () => {
      await this.criarImportacaoMobileMed.agendada();
    });
    this.registro.agendar(TAREFA_AGENDAR_MOBILEMED, '* * * * *');
  }
}
