import { Inject, Module, type OnModuleInit } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import { RegistroTarefas } from '../comum/jobs/registro-tarefas';
import { COMPETENCIAS_BLOQUEADAS } from '../ingestao/application/ports/competencias-bloqueadas';
import { CORTES_COMPETENCIA } from '../ingestao/application/ports/cortes-competencia';
import { TIPIFICACAO_LAUDOS } from '../ingestao/application/ports/tipificacao-laudos';
import {
  AJUSTES_LAUDO_REPOSITORY,
  type AjustesLaudoRepository,
} from './application/ports/ajustes-laudo.repository';
import {
  AVISOS_DO_DEMONSTRATIVO,
  type AvisosDoDemonstrativo,
} from './application/ports/avisos-do-demonstrativo';
import {
  AVISOS_DO_FECHAMENTO,
  type AvisosDoFechamento,
} from './application/ports/avisos-do-fechamento';
import {
  COMPETENCIAS_REPOSITORY,
  type CompetenciasRepository,
} from './application/ports/competencias.repository';
import { CORTES_REPOSITORY, type CortesRepository } from './application/ports/cortes.repository';
import {
  DADOS_FISCAIS_REPOSITORY,
  type DadosFiscaisRepository,
} from './application/ports/dados-fiscais.repository';
import {
  DEMONSTRATIVOS_REPOSITORY,
  type DemonstrativosRepository,
} from './application/ports/demonstrativos.repository';
import {
  ENTRADAS_DEMONSTRATIVO,
  type EntradasDemonstrativo,
} from './application/ports/entradas-demonstrativo';
import { EQUIPES_MEDICOS, type EquipesMedicos } from './application/ports/equipes-medicos';
import {
  HISTORICO_DADOS_FISCAIS,
  type HistoricoDadosFiscaisRepository,
} from './application/ports/historico-dados-fiscais';
import { LAUDOS_COMPETENCIA, type LaudosCompetencia } from './application/ports/laudos-competencia';
import {
  PARAMETROS_DEMONSTRATIVO_REPOSITORY,
  type ParametrosDemonstrativoRepository,
} from './application/ports/parametros-demonstrativo.repository';
import { PRECOS_REPOSITORY, type PrecosRepository } from './application/ports/precos.repository';
import {
  RECALCULOS_COMPETENCIA,
  type RecalculosCompetencia,
} from './application/ports/recalculos-competencia';
import {
  RECLASSIFICACOES_REPOSITORY,
  type ReclassificacoesRepository,
} from './application/ports/reclassificacoes.repository';
import {
  TIPIFICACAO_REPOSITORY,
  type TipificacaoRepository,
} from './application/ports/tipificacao.repository';
import { RegistroRecalculadores } from './application/recalculadores';
import {
  CriarAjusteLaudo,
  EncerrarAjusteLaudo,
  ListarAjustesLaudo,
} from './application/use-cases/ajustes-laudo';
import { CarregarTipificador } from './application/use-cases/carregar-tipificador';
import {
  DetalharLaudoDemonstrativo,
  ListarDemonstrativos,
  ObterDemonstrativo,
} from './application/use-cases/consultar-demonstrativos';
import { CriarCorte } from './application/use-cases/criar-corte';
import {
  DefinirDadosFiscais,
  HistoricoDadosFiscais,
  ObterDadosFiscais,
} from './application/use-cases/dados-fiscais';
import { FecharCompetencia } from './application/use-cases/fechar-competencia';
import { GerarDemonstrativos } from './application/use-cases/gerar-demonstrativos';
import { ListarCompetencias } from './application/use-cases/listar-competencias';
import { ListarCortes } from './application/use-cases/listar-cortes';
import {
  ListarAlternativasPreco,
  ListarParametrosDemonstrativo,
  MudarAlternativaPreco,
  MudarParametrosDemonstrativo,
} from './application/use-cases/parametros-demonstrativo';
import {
  ExportarPrecos,
  HistoricoPreco,
  ListarPrecos,
  MudarPrecos,
  OpcoesPrecos,
} from './application/use-cases/precos';
import { PreviaCorte } from './application/use-cases/previa-corte';
import { ReabrirCompetencia } from './application/use-cases/reabrir-competencia';
import {
  ListarRecalculos,
  RecalcularCompetenciaFechada,
} from './application/use-cases/recalcular-competencia';
import {
  CriarReclassificacaoFaturamento,
  EncerrarReclassificacaoFaturamento,
  ListarReclassificacoesFaturamento,
} from './application/use-cases/reclassificacoes';
import {
  BuscarMedicosTipificacao,
  ListarOpcoesTipificacao,
  ListarTipificacao,
  MudarFaturaTipificacao,
  ObterTipificacaoCliente,
  PreviaTipificacaoCliente,
  RemoverVersaoTipificacaoCliente,
  SalvarRegraTipificacao,
  SalvarSubregraTipificacao,
  SalvarTipificacaoCliente,
} from './application/use-cases/tipificacao';
import { DestravarImportacao, TravarImportacao } from './application/use-cases/travar-importacao';
import { RegistroAvisosDoDemonstrativo } from './infrastructure/avisos/registro-avisos-do-demonstrativo';
import { AjustesLaudoController } from './infrastructure/http/ajustes-laudo.controller';
import { CompetenciasController } from './infrastructure/http/competencias.controller';
import { CortesController } from './infrastructure/http/cortes.controller';
import { DadosFiscaisController } from './infrastructure/http/dados-fiscais.controller';
import { DemonstrativosController } from './infrastructure/http/demonstrativos.controller';
import { ParametrosDemonstrativoController } from './infrastructure/http/parametros-demonstrativo.controller';
import { PrecosController } from './infrastructure/http/precos.controller';
import {
  TipificacaoClienteController,
  TipificacaoController,
} from './infrastructure/http/tipificacao.controller';
import {
  enfileirarRecalculoDemonstrativo,
  pedidoDoPayload,
  TAREFA_GERAR_DEMONSTRATIVOS,
} from './infrastructure/jobs/enfileirar-demonstrativos';
import { DrizzleAjustesLaudoRepository } from './infrastructure/persistence/drizzle-ajustes-laudo.repository';
import { DrizzleCompetenciasRepository } from './infrastructure/persistence/drizzle-competencias.repository';
import { DrizzleCortesRepository } from './infrastructure/persistence/drizzle-cortes.repository';
import { DrizzleDadosFiscaisRepository } from './infrastructure/persistence/drizzle-dados-fiscais.repository';
import { DrizzleDemonstrativosRepository } from './infrastructure/persistence/drizzle-demonstrativos.repository';
import { DrizzleEntradasDemonstrativo } from './infrastructure/persistence/drizzle-entradas-demonstrativo';
import { DrizzleEquipesMedicos } from './infrastructure/persistence/drizzle-equipes-medicos';
import { DrizzleHistoricoDadosFiscais } from './infrastructure/persistence/drizzle-historico-dados-fiscais';
import { DrizzleLaudosCompetencia } from './infrastructure/persistence/drizzle-laudos-competencia';
import { DrizzleParametrosDemonstrativoRepository } from './infrastructure/persistence/drizzle-parametros-demonstrativo.repository';
import { DrizzlePrecosRepository } from './infrastructure/persistence/drizzle-precos.repository';
import { DrizzleRecalculosCompetencia } from './infrastructure/persistence/drizzle-recalculos-competencia';
import { DrizzleReclassificacoesRepository } from './infrastructure/persistence/drizzle-reclassificacoes.repository';
import { DrizzleTipificacaoRepository } from './infrastructure/persistence/drizzle-tipificacao.repository';

const agora = () => new Date();

/** Casos de uso de uma ação sobre a competência: repositório, auditoria e relógio. */
const ACOES_COMPETENCIA = [ReabrirCompetencia, TravarImportacao, DestravarImportacao] as const;

/**
 * Contexto `faturamento` (hexagonal): competências, cortes, dados fiscais do cliente, tipificação e preços. Implementa as portas da `ingestao`
 * (`COMPETENCIAS_BLOQUEADAS`, `CORTES_COMPETENCIA`, `TIPIFICACAO_LAUDOS`); não importa o `IngestaoModule`, para não
 * criar ciclo.
 */
@Module({
  controllers: [
    CompetenciasController,
    CortesController,
    DadosFiscaisController,
    TipificacaoController,
    TipificacaoClienteController,
    PrecosController,
    ParametrosDemonstrativoController,
    AjustesLaudoController,
    DemonstrativosController,
  ],
  providers: [
    { provide: COMPETENCIAS_REPOSITORY, useClass: DrizzleCompetenciasRepository },
    { provide: CORTES_REPOSITORY, useClass: DrizzleCortesRepository },
    { provide: LAUDOS_COMPETENCIA, useClass: DrizzleLaudosCompetencia },
    { provide: DADOS_FISCAIS_REPOSITORY, useClass: DrizzleDadosFiscaisRepository },
    { provide: HISTORICO_DADOS_FISCAIS, useClass: DrizzleHistoricoDadosFiscais },
    { provide: COMPETENCIAS_BLOQUEADAS, useExisting: COMPETENCIAS_REPOSITORY },
    { provide: CORTES_COMPETENCIA, useExisting: CORTES_REPOSITORY },
    { provide: TIPIFICACAO_REPOSITORY, useClass: DrizzleTipificacaoRepository },
    // Equipes e médicos do contexto `medicos`, lidos por uma porta (sem importar o MedicosModule).
    { provide: EQUIPES_MEDICOS, useClass: DrizzleEquipesMedicos },
    {
      provide: TIPIFICACAO_LAUDOS,
      inject: [TIPIFICACAO_REPOSITORY, EQUIPES_MEDICOS],
      useFactory: (repo: TipificacaoRepository, equipes: EquipesMedicos) =>
        new CarregarTipificador(repo, equipes),
    },
    {
      provide: ListarTipificacao,
      inject: [TIPIFICACAO_REPOSITORY, COMPETENCIAS_REPOSITORY],
      useFactory: (repo: TipificacaoRepository, competencias: CompetenciasRepository) =>
        new ListarTipificacao(repo, competencias, agora),
    },
    ...[SalvarTipificacaoCliente, ObterTipificacaoCliente, PreviaTipificacaoCliente].map(
      (Caso) => ({
        provide: Caso,
        inject: [TIPIFICACAO_REPOSITORY, EQUIPES_MEDICOS, COMPETENCIAS_REPOSITORY],
        useFactory: (
          repo: TipificacaoRepository,
          equipes: EquipesMedicos,
          competencias: CompetenciasRepository,
        ) => new Caso(repo, equipes, competencias, agora),
      }),
    ),
    ...[
      SalvarRegraTipificacao,
      SalvarSubregraTipificacao,
      MudarFaturaTipificacao,
      RemoverVersaoTipificacaoCliente,
    ].map((Caso) => ({
      provide: Caso,
      inject: [TIPIFICACAO_REPOSITORY, COMPETENCIAS_REPOSITORY],
      useFactory: (repo: TipificacaoRepository, competencias: CompetenciasRepository) =>
        new Caso(repo, competencias, agora),
    })),
    {
      provide: ListarOpcoesTipificacao,
      inject: [TIPIFICACAO_REPOSITORY, EQUIPES_MEDICOS],
      useFactory: (repo: TipificacaoRepository, equipes: EquipesMedicos) =>
        new ListarOpcoesTipificacao(repo, equipes),
    },
    {
      provide: BuscarMedicosTipificacao,
      inject: [EQUIPES_MEDICOS],
      useFactory: (equipes: EquipesMedicos) => new BuscarMedicosTipificacao(equipes),
    },
    {
      provide: ListarCompetencias,
      inject: [COMPETENCIAS_REPOSITORY],
      useFactory: (competencias: CompetenciasRepository) => new ListarCompetencias(competencias),
    },
    {
      // Os avisos que impedem fechar vêm da ingestão, pelo módulo global de avisos.
      provide: FecharCompetencia,
      inject: [COMPETENCIAS_REPOSITORY, AVISOS_DO_FECHAMENTO, AUDITORIA],
      useFactory: (
        competencias: CompetenciasRepository,
        avisos: AvisosDoFechamento,
        auditoria: Auditoria,
      ) => new FecharCompetencia(competencias, avisos, auditoria, agora),
    },
    ...ACOES_COMPETENCIA.map((Caso) => ({
      provide: Caso,
      inject: [COMPETENCIAS_REPOSITORY, AUDITORIA],
      useFactory: (competencias: CompetenciasRepository, auditoria: Auditoria) =>
        new Caso(competencias, auditoria, agora),
    })),
    {
      provide: PARAMETROS_DEMONSTRATIVO_REPOSITORY,
      useClass: DrizzleParametrosDemonstrativoRepository,
    },
    ...[ListarParametrosDemonstrativo, ListarAlternativasPreco].map((Caso) => ({
      provide: Caso,
      inject: [PARAMETROS_DEMONSTRATIVO_REPOSITORY, COMPETENCIAS_REPOSITORY],
      useFactory: (repo: ParametrosDemonstrativoRepository, competencias: CompetenciasRepository) =>
        new Caso(repo, competencias, agora),
    })),
    ...[MudarParametrosDemonstrativo, MudarAlternativaPreco].map((Caso) => ({
      provide: Caso,
      inject: [PARAMETROS_DEMONSTRATIVO_REPOSITORY, COMPETENCIAS_REPOSITORY, AUDITORIA],
      useFactory: (
        repo: ParametrosDemonstrativoRepository,
        competencias: CompetenciasRepository,
        auditoria: Auditoria,
      ) => new Caso(repo, competencias, auditoria, agora),
    })),
    { provide: DEMONSTRATIVOS_REPOSITORY, useClass: DrizzleDemonstrativosRepository },
    { provide: ENTRADAS_DEMONSTRATIVO, useClass: DrizzleEntradasDemonstrativo },
    { provide: AVISOS_DO_DEMONSTRATIVO, useClass: RegistroAvisosDoDemonstrativo },
    {
      provide: GerarDemonstrativos,
      inject: [
        COMPETENCIAS_REPOSITORY,
        ENTRADAS_DEMONSTRATIVO,
        DEMONSTRATIVOS_REPOSITORY,
        RECALCULOS_COMPETENCIA,
        AVISOS_DO_DEMONSTRATIVO,
      ],
      useFactory: (
        competencias: CompetenciasRepository,
        entradas: EntradasDemonstrativo,
        demonstrativos: DemonstrativosRepository,
        recalculos: RecalculosCompetencia,
        avisos: AvisosDoDemonstrativo,
      ) =>
        new GerarDemonstrativos(competencias, entradas, demonstrativos, recalculos, avisos, agora),
    },
    { provide: RECLASSIFICACOES_REPOSITORY, useClass: DrizzleReclassificacoesRepository },
    {
      provide: ListarReclassificacoesFaturamento,
      inject: [RECLASSIFICACOES_REPOSITORY],
      useFactory: (repo: ReclassificacoesRepository) => new ListarReclassificacoesFaturamento(repo),
    },
    ...[CriarReclassificacaoFaturamento, EncerrarReclassificacaoFaturamento].map((Caso) => ({
      provide: Caso,
      inject: [RECLASSIFICACOES_REPOSITORY, COMPETENCIAS_REPOSITORY, AUDITORIA],
      useFactory: (
        repo: ReclassificacoesRepository,
        competencias: CompetenciasRepository,
        auditoria: Auditoria,
      ) => new Caso(repo, competencias, auditoria, agora),
    })),
    { provide: AJUSTES_LAUDO_REPOSITORY, useClass: DrizzleAjustesLaudoRepository },
    {
      provide: ListarAjustesLaudo,
      inject: [AJUSTES_LAUDO_REPOSITORY],
      useFactory: (repo: AjustesLaudoRepository) => new ListarAjustesLaudo(repo),
    },
    ...[CriarAjusteLaudo, EncerrarAjusteLaudo].map((Caso) => ({
      provide: Caso,
      inject: [AJUSTES_LAUDO_REPOSITORY, AUDITORIA],
      useFactory: (repo: AjustesLaudoRepository, auditoria: Auditoria) =>
        new Caso(repo, auditoria, agora),
    })),
    ...[ListarDemonstrativos, ObterDemonstrativo].map((Caso) => ({
      provide: Caso,
      inject: [DEMONSTRATIVOS_REPOSITORY],
      useFactory: (repo: DemonstrativosRepository) => new Caso(repo),
    })),
    {
      provide: DetalharLaudoDemonstrativo,
      inject: [ENTRADAS_DEMONSTRATIVO],
      useFactory: (entradas: EntradasDemonstrativo) => new DetalharLaudoDemonstrativo(entradas),
    },
    // Um registro só para todos os contextos (faturamento, repasse): cada um registra o seu.
    { provide: RegistroRecalculadores, useFactory: () => new RegistroRecalculadores() },
    { provide: RECALCULOS_COMPETENCIA, useClass: DrizzleRecalculosCompetencia },
    {
      provide: RecalcularCompetenciaFechada,
      inject: [COMPETENCIAS_REPOSITORY, RECALCULOS_COMPETENCIA, RegistroRecalculadores, AUDITORIA],
      useFactory: (
        competencias: CompetenciasRepository,
        recalculos: RecalculosCompetencia,
        registro: RegistroRecalculadores,
        auditoria: Auditoria,
      ) => new RecalcularCompetenciaFechada(competencias, recalculos, registro, auditoria, agora),
    },
    {
      provide: ListarRecalculos,
      inject: [COMPETENCIAS_REPOSITORY, RECALCULOS_COMPETENCIA],
      useFactory: (competencias: CompetenciasRepository, recalculos: RecalculosCompetencia) =>
        new ListarRecalculos(competencias, recalculos),
    },
    {
      provide: ListarCortes,
      inject: [CORTES_REPOSITORY],
      useFactory: (cortes: CortesRepository) => new ListarCortes(cortes),
    },
    {
      provide: PreviaCorte,
      inject: [CORTES_REPOSITORY, COMPETENCIAS_REPOSITORY, LAUDOS_COMPETENCIA],
      useFactory: (
        cortes: CortesRepository,
        competencias: CompetenciasRepository,
        laudos: LaudosCompetencia,
      ) => new PreviaCorte(cortes, competencias, laudos),
    },
    {
      provide: CriarCorte,
      inject: [CORTES_REPOSITORY, COMPETENCIAS_REPOSITORY, AUDITORIA],
      useFactory: (
        cortes: CortesRepository,
        competencias: CompetenciasRepository,
        auditoria: Auditoria,
      ) => new CriarCorte(cortes, competencias, auditoria, agora),
    },
    { provide: PRECOS_REPOSITORY, useClass: DrizzlePrecosRepository },
    {
      provide: ListarPrecos,
      inject: [PRECOS_REPOSITORY, COMPETENCIAS_REPOSITORY],
      useFactory: (repo: PrecosRepository, competencias: CompetenciasRepository) =>
        new ListarPrecos(repo, competencias, agora),
    },
    {
      provide: MudarPrecos,
      inject: [PRECOS_REPOSITORY, COMPETENCIAS_REPOSITORY],
      // A auditoria vai pelo repositório, na mesma transação da mudança.
      useFactory: (repo: PrecosRepository, competencias: CompetenciasRepository) =>
        new MudarPrecos(repo, competencias, agora),
    },
    {
      provide: ExportarPrecos,
      inject: [PRECOS_REPOSITORY],
      useFactory: (repo: PrecosRepository) => new ExportarPrecos(repo, agora),
    },
    ...[HistoricoPreco, OpcoesPrecos].map((Caso) => ({
      provide: Caso,
      inject: [PRECOS_REPOSITORY],
      useFactory: (repo: PrecosRepository) => new Caso(repo),
    })),
    {
      provide: ObterDadosFiscais,
      inject: [DADOS_FISCAIS_REPOSITORY],
      useFactory: (repo: DadosFiscaisRepository) => new ObterDadosFiscais(repo),
    },
    {
      provide: DefinirDadosFiscais,
      inject: [DADOS_FISCAIS_REPOSITORY, AUDITORIA],
      useFactory: (repo: DadosFiscaisRepository, auditoria: Auditoria) =>
        new DefinirDadosFiscais(repo, auditoria, agora),
    },
    {
      provide: HistoricoDadosFiscais,
      inject: [DADOS_FISCAIS_REPOSITORY, HISTORICO_DADOS_FISCAIS],
      useFactory: (repo: DadosFiscaisRepository, historico: HistoricoDadosFiscaisRepository) =>
        new HistoricoDadosFiscais(repo, historico),
    },
  ],
  // O registro, o histórico e o pedido de recálculo servem também ao `repasse` (fechamento
  // único): o caso de uso recebe o contexto, e cada aplicação tem o seu registro.
  exports: [
    COMPETENCIAS_BLOQUEADAS,
    CORTES_COMPETENCIA,
    TIPIFICACAO_LAUDOS,
    RegistroRecalculadores,
    RECALCULOS_COMPETENCIA,
    RecalcularCompetenciaFechada,
  ],
})
export class FaturamentoModule implements OnModuleInit {
  constructor(
    @Inject(CORTES_REPOSITORY) private readonly cortes: CortesRepository,
    private readonly tarefas: RegistroTarefas,
    private readonly recalculadores: RegistroRecalculadores,
    private readonly gerarDemonstrativos: GerarDemonstrativos,
  ) {}

  /** A vigência padrão inicial (dia 7, mês seguinte) fica gravada, para a tela mostrar e o histórico começar dela. */
  async onModuleInit() {
    this.tarefas.registrar(TAREFA_GERAR_DEMONSTRATIVOS, (payload) =>
      this.gerarDemonstrativos.executar(pedidoDoPayload(payload)),
    );
    // O recálculo da fechada com motivo refaz o demonstrativo como versão nova.
    this.recalculadores.registrar({
      contexto: 'faturamento',
      enfileirar: (executor, { recalculoId }) =>
        enfileirarRecalculoDemonstrativo(executor, recalculoId),
    });
    await this.cortes.garantirPadraoInicial();
  }
}
