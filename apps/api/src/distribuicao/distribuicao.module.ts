import { Module } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import {
  ARRANJOS_REPOSITORY,
  type ArranjosRepository,
} from './application/ports/arranjos.repository';
import {
  CADASTROS_DISTRIBUICAO,
  type CadastrosDistribuicao,
} from './application/ports/cadastros-distribuicao';
import {
  CONFIGURACAO_DISTRIBUICAO_REPOSITORY,
  type ConfiguracaoDistribuicaoRepository,
} from './application/ports/configuracao-distribuicao.repository';
import {
  PARAMETROS_EQUIPE_REPOSITORY,
  type ParametrosEquipeRepository,
} from './application/ports/parametros-equipe.repository';
import {
  PARAMETROS_MEDICO_REPOSITORY,
  type ParametrosMedicoRepository,
} from './application/ports/parametros-medico.repository';
import {
  PRIORIDADES_CLIENTE_REPOSITORY,
  type PrioridadesClienteRepository,
} from './application/ports/prioridades-cliente.repository';
import {
  REGRAS_FRENTE_REPOSITORY,
  type RegrasFrenteRepository,
} from './application/ports/regras-frente.repository';
import { ConsultarArranjos, SalvarArranjos } from './application/use-cases/arranjos';
import {
  DefinirConfiguracaoGlobal,
  ObterConfiguracaoGlobal,
} from './application/use-cases/configuracao-global';
import {
  DefinirPrioridadesCliente,
  ObterPrioridadesCliente,
} from './application/use-cases/prioridades-cliente';
import {
  DefinirRegrasFrente,
  ListarRegrasFrente,
  ObterRegrasFrente,
} from './application/use-cases/regras-frente';
import { DefinirRoboMedico, ObterRoboMedico } from './application/use-cases/robo-medico';
import { SugerirAlocacao } from './application/use-cases/sugerir-alocacao';
import { DefinirUsoEquipe, ObterUsoEquipe } from './application/use-cases/uso-equipe';
import {
  DistribuicaoEquipeController,
  DistribuicaoMedicoController,
  SugestaoAlocacaoController,
} from './infrastructure/http/arranjos.controller';
import { ConfiguracaoDistribuicaoController } from './infrastructure/http/configuracao.controller';
import { PrioridadesClienteController } from './infrastructure/http/prioridades-cliente.controller';
import { RegrasFrenteController } from './infrastructure/http/regras-frente.controller';
import { DrizzleArranjosRepository } from './infrastructure/persistence/drizzle-arranjos.repository';
import { DrizzleCadastrosDistribuicao } from './infrastructure/persistence/drizzle-cadastros-distribuicao';
import { DrizzleConfiguracaoDistribuicaoRepository } from './infrastructure/persistence/drizzle-configuracao-distribuicao.repository';
import { DrizzleParametrosEquipeRepository } from './infrastructure/persistence/drizzle-parametros-equipe.repository';
import { DrizzleParametrosMedicoRepository } from './infrastructure/persistence/drizzle-parametros-medico.repository';
import { DrizzlePrioridadesClienteRepository } from './infrastructure/persistence/drizzle-prioridades-cliente.repository';
import { DrizzleRegrasFrenteRepository } from './infrastructure/persistence/drizzle-regras-frente.repository';

const agora = () => new Date();

/** Contexto `distribuicao` (hexagonal): arranjos, parâmetros, configuração e rodadas do robô. */
@Module({
  controllers: [
    DistribuicaoMedicoController,
    DistribuicaoEquipeController,
    SugestaoAlocacaoController,
    ConfiguracaoDistribuicaoController,
    RegrasFrenteController,
    PrioridadesClienteController,
  ],
  providers: [
    { provide: PRIORIDADES_CLIENTE_REPOSITORY, useClass: DrizzlePrioridadesClienteRepository },
    {
      provide: ObterPrioridadesCliente,
      inject: [PRIORIDADES_CLIENTE_REPOSITORY, CADASTROS_DISTRIBUICAO],
      useFactory: (repo: PrioridadesClienteRepository, cadastros: CadastrosDistribuicao) =>
        new ObterPrioridadesCliente(repo, cadastros),
    },
    {
      provide: DefinirPrioridadesCliente,
      inject: [PRIORIDADES_CLIENTE_REPOSITORY, CADASTROS_DISTRIBUICAO, AUDITORIA],
      useFactory: (
        repo: PrioridadesClienteRepository,
        cadastros: CadastrosDistribuicao,
        auditoria: Auditoria,
      ) => new DefinirPrioridadesCliente(repo, cadastros, auditoria, agora),
    },
    { provide: REGRAS_FRENTE_REPOSITORY, useClass: DrizzleRegrasFrenteRepository },
    {
      provide: ObterRegrasFrente,
      inject: [REGRAS_FRENTE_REPOSITORY, CADASTROS_DISTRIBUICAO],
      useFactory: (repo: RegrasFrenteRepository, cadastros: CadastrosDistribuicao) =>
        new ObterRegrasFrente(repo, cadastros),
    },
    {
      provide: ListarRegrasFrente,
      inject: [REGRAS_FRENTE_REPOSITORY],
      useFactory: (repo: RegrasFrenteRepository) => new ListarRegrasFrente(repo),
    },
    {
      provide: DefinirRegrasFrente,
      inject: [REGRAS_FRENTE_REPOSITORY, CADASTROS_DISTRIBUICAO, AUDITORIA],
      useFactory: (
        repo: RegrasFrenteRepository,
        cadastros: CadastrosDistribuicao,
        auditoria: Auditoria,
      ) => new DefinirRegrasFrente(repo, cadastros, auditoria, agora),
    },
    {
      provide: CONFIGURACAO_DISTRIBUICAO_REPOSITORY,
      useClass: DrizzleConfiguracaoDistribuicaoRepository,
    },
    {
      provide: ObterConfiguracaoGlobal,
      inject: [CONFIGURACAO_DISTRIBUICAO_REPOSITORY],
      useFactory: (repo: ConfiguracaoDistribuicaoRepository) => new ObterConfiguracaoGlobal(repo),
    },
    {
      provide: DefinirConfiguracaoGlobal,
      inject: [CONFIGURACAO_DISTRIBUICAO_REPOSITORY, CADASTROS_DISTRIBUICAO, AUDITORIA],
      useFactory: (
        repo: ConfiguracaoDistribuicaoRepository,
        cadastros: CadastrosDistribuicao,
        auditoria: Auditoria,
      ) => new DefinirConfiguracaoGlobal(repo, cadastros, auditoria, agora),
    },
    { provide: ARRANJOS_REPOSITORY, useClass: DrizzleArranjosRepository },
    { provide: PARAMETROS_MEDICO_REPOSITORY, useClass: DrizzleParametrosMedicoRepository },
    { provide: PARAMETROS_EQUIPE_REPOSITORY, useClass: DrizzleParametrosEquipeRepository },
    { provide: CADASTROS_DISTRIBUICAO, useClass: DrizzleCadastrosDistribuicao },
    {
      provide: ConsultarArranjos,
      inject: [ARRANJOS_REPOSITORY, CADASTROS_DISTRIBUICAO],
      useFactory: (arranjos: ArranjosRepository, cadastros: CadastrosDistribuicao) =>
        new ConsultarArranjos(arranjos, cadastros),
    },
    {
      provide: SalvarArranjos,
      inject: [ARRANJOS_REPOSITORY, CADASTROS_DISTRIBUICAO, AUDITORIA],
      useFactory: (
        arranjos: ArranjosRepository,
        cadastros: CadastrosDistribuicao,
        auditoria: Auditoria,
      ) => new SalvarArranjos(arranjos, cadastros, auditoria, agora),
    },
    {
      provide: ObterRoboMedico,
      inject: [PARAMETROS_MEDICO_REPOSITORY, CADASTROS_DISTRIBUICAO],
      useFactory: (parametros: ParametrosMedicoRepository, cadastros: CadastrosDistribuicao) =>
        new ObterRoboMedico(parametros, cadastros),
    },
    {
      provide: DefinirRoboMedico,
      inject: [PARAMETROS_MEDICO_REPOSITORY, CADASTROS_DISTRIBUICAO, AUDITORIA],
      useFactory: (
        parametros: ParametrosMedicoRepository,
        cadastros: CadastrosDistribuicao,
        auditoria: Auditoria,
      ) => new DefinirRoboMedico(parametros, cadastros, auditoria, agora),
    },
    {
      provide: ObterUsoEquipe,
      inject: [PARAMETROS_EQUIPE_REPOSITORY, CADASTROS_DISTRIBUICAO],
      useFactory: (parametros: ParametrosEquipeRepository, cadastros: CadastrosDistribuicao) =>
        new ObterUsoEquipe(parametros, cadastros),
    },
    {
      provide: DefinirUsoEquipe,
      inject: [PARAMETROS_EQUIPE_REPOSITORY, CADASTROS_DISTRIBUICAO, AUDITORIA],
      useFactory: (
        parametros: ParametrosEquipeRepository,
        cadastros: CadastrosDistribuicao,
        auditoria: Auditoria,
      ) => new DefinirUsoEquipe(parametros, cadastros, auditoria, agora),
    },
    {
      provide: SugerirAlocacao,
      inject: [ARRANJOS_REPOSITORY, CADASTROS_DISTRIBUICAO],
      useFactory: (arranjos: ArranjosRepository, cadastros: CadastrosDistribuicao) =>
        new SugerirAlocacao(arranjos, cadastros),
    },
  ],
})
export class DistribuicaoModule {}
