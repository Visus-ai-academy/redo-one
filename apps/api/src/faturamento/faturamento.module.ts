import { Inject, Module, type OnModuleInit } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import { COMPETENCIAS_BLOQUEADAS } from '../ingestao/application/ports/competencias-bloqueadas';
import { CORTES_COMPETENCIA } from '../ingestao/application/ports/cortes-competencia';
import { TIPIFICACAO_LAUDOS } from '../ingestao/application/ports/tipificacao-laudos';
import {
  COMPETENCIAS_REPOSITORY,
  type CompetenciasRepository,
} from './application/ports/competencias.repository';
import { CORTES_REPOSITORY, type CortesRepository } from './application/ports/cortes.repository';
import {
  DADOS_FISCAIS_REPOSITORY,
  type DadosFiscaisRepository,
} from './application/ports/dados-fiscais.repository';
import { EQUIPES_MEDICOS, type EquipesMedicos } from './application/ports/equipes-medicos';
import { LAUDOS_COMPETENCIA, type LaudosCompetencia } from './application/ports/laudos-competencia';
import {
  TIPIFICACAO_REPOSITORY,
  type TipificacaoRepository,
} from './application/ports/tipificacao.repository';
import { CarregarTipificador } from './application/use-cases/carregar-tipificador';
import { CriarCorte } from './application/use-cases/criar-corte';
import { DefinirDadosFiscais, ObterDadosFiscais } from './application/use-cases/dados-fiscais';
import { FecharCompetencia } from './application/use-cases/fechar-competencia';
import { ListarCompetencias } from './application/use-cases/listar-competencias';
import { ListarCortes } from './application/use-cases/listar-cortes';
import { PreviaCorte } from './application/use-cases/previa-corte';
import { ReabrirCompetencia } from './application/use-cases/reabrir-competencia';
import {
  BuscarMedicosTipificacao,
  ListarOpcoesTipificacao,
  ListarTipificacao,
  ObterTipificacaoCliente,
  PreviaTipificacaoCliente,
  SalvarRegraTipificacao,
  SalvarSubregraTipificacao,
  SalvarTipificacaoCliente,
} from './application/use-cases/tipificacao';
import { DestravarImportacao, TravarImportacao } from './application/use-cases/travar-importacao';
import { CompetenciasController } from './infrastructure/http/competencias.controller';
import { CortesController } from './infrastructure/http/cortes.controller';
import { DadosFiscaisController } from './infrastructure/http/dados-fiscais.controller';
import {
  TipificacaoClienteController,
  TipificacaoController,
} from './infrastructure/http/tipificacao.controller';
import { DrizzleCompetenciasRepository } from './infrastructure/persistence/drizzle-competencias.repository';
import { DrizzleCortesRepository } from './infrastructure/persistence/drizzle-cortes.repository';
import { DrizzleDadosFiscaisRepository } from './infrastructure/persistence/drizzle-dados-fiscais.repository';
import { DrizzleEquipesMedicos } from './infrastructure/persistence/drizzle-equipes-medicos';
import { DrizzleLaudosCompetencia } from './infrastructure/persistence/drizzle-laudos-competencia';
import { DrizzleTipificacaoRepository } from './infrastructure/persistence/drizzle-tipificacao.repository';

const agora = () => new Date();

/** Casos de uso de uma ação sobre a competência: repositório, auditoria e relógio. */
const ACOES_COMPETENCIA = [
  FecharCompetencia,
  ReabrirCompetencia,
  TravarImportacao,
  DestravarImportacao,
] as const;

/**
 * Contexto `faturamento` (hexagonal): competências, cortes, dados fiscais do cliente e tipificação. Implementa as portas da `ingestao`
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
  ],
  providers: [
    { provide: COMPETENCIAS_REPOSITORY, useClass: DrizzleCompetenciasRepository },
    { provide: CORTES_REPOSITORY, useClass: DrizzleCortesRepository },
    { provide: LAUDOS_COMPETENCIA, useClass: DrizzleLaudosCompetencia },
    { provide: DADOS_FISCAIS_REPOSITORY, useClass: DrizzleDadosFiscaisRepository },
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
      inject: [TIPIFICACAO_REPOSITORY],
      useFactory: (repo: TipificacaoRepository) => new ListarTipificacao(repo),
    },
    ...[SalvarRegraTipificacao, SalvarSubregraTipificacao, SalvarTipificacaoCliente].map(
      (Caso) => ({
        provide: Caso,
        inject: [TIPIFICACAO_REPOSITORY, AUDITORIA],
        useFactory: (repo: TipificacaoRepository, auditoria: Auditoria) =>
          new Caso(repo, auditoria, agora),
      }),
    ),
    ...[ListarOpcoesTipificacao, ObterTipificacaoCliente].map((Caso) => ({
      provide: Caso,
      inject: [TIPIFICACAO_REPOSITORY, EQUIPES_MEDICOS],
      useFactory: (repo: TipificacaoRepository, equipes: EquipesMedicos) => new Caso(repo, equipes),
    })),
    {
      provide: BuscarMedicosTipificacao,
      inject: [EQUIPES_MEDICOS],
      useFactory: (equipes: EquipesMedicos) => new BuscarMedicosTipificacao(equipes),
    },
    {
      provide: PreviaTipificacaoCliente,
      inject: [TIPIFICACAO_REPOSITORY, EQUIPES_MEDICOS, COMPETENCIAS_REPOSITORY],
      useFactory: (
        repo: TipificacaoRepository,
        equipes: EquipesMedicos,
        competencias: CompetenciasRepository,
      ) => new PreviaTipificacaoCliente(repo, equipes, competencias),
    },
    {
      provide: ListarCompetencias,
      inject: [COMPETENCIAS_REPOSITORY],
      useFactory: (competencias: CompetenciasRepository) => new ListarCompetencias(competencias),
    },
    ...ACOES_COMPETENCIA.map((Caso) => ({
      provide: Caso,
      inject: [COMPETENCIAS_REPOSITORY, AUDITORIA],
      useFactory: (competencias: CompetenciasRepository, auditoria: Auditoria) =>
        new Caso(competencias, auditoria, agora),
    })),
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
  ],
  exports: [COMPETENCIAS_BLOQUEADAS, CORTES_COMPETENCIA, TIPIFICACAO_LAUDOS],
})
export class FaturamentoModule implements OnModuleInit {
  constructor(@Inject(CORTES_REPOSITORY) private readonly cortes: CortesRepository) {}

  /** A vigência padrão inicial (dia 7, mês seguinte) fica gravada, para a tela mostrar e o histórico começar dela. */
  async onModuleInit() {
    await this.cortes.garantirPadraoInicial();
  }
}
