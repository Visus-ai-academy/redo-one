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
  PARAMETROS_EQUIPE_REPOSITORY,
  type ParametrosEquipeRepository,
} from './application/ports/parametros-equipe.repository';
import {
  PARAMETROS_MEDICO_REPOSITORY,
  type ParametrosMedicoRepository,
} from './application/ports/parametros-medico.repository';
import { ConsultarArranjos, SalvarArranjos } from './application/use-cases/arranjos';
import { DefinirRoboMedico, ObterRoboMedico } from './application/use-cases/robo-medico';
import { SugerirAlocacao } from './application/use-cases/sugerir-alocacao';
import { DefinirUsoEquipe, ObterUsoEquipe } from './application/use-cases/uso-equipe';
import {
  DistribuicaoEquipeController,
  DistribuicaoMedicoController,
  SugestaoAlocacaoController,
} from './infrastructure/http/arranjos.controller';
import { DrizzleArranjosRepository } from './infrastructure/persistence/drizzle-arranjos.repository';
import { DrizzleCadastrosDistribuicao } from './infrastructure/persistence/drizzle-cadastros-distribuicao';
import { DrizzleParametrosEquipeRepository } from './infrastructure/persistence/drizzle-parametros-equipe.repository';
import { DrizzleParametrosMedicoRepository } from './infrastructure/persistence/drizzle-parametros-medico.repository';

const agora = () => new Date();

/** Contexto `distribuicao` (hexagonal): arranjos, parâmetros e rodadas do robô. */
@Module({
  controllers: [
    DistribuicaoMedicoController,
    DistribuicaoEquipeController,
    SugestaoAlocacaoController,
  ],
  providers: [
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
