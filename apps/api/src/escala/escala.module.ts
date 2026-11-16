import { Module } from '@nestjs/common';

import { AlocacoesModule } from './alocacoes/alocacoes.module';
import { AusenciasModule } from './ausencias/ausencias.module';
import { CadastrosEscalaModule } from './cadastros/cadastros-escala.module';
import { DrizzleEscopoEscalaRepository } from './escopo/drizzle-escopo.repository';
import { ESCOPO_ESCALA_REPOSITORY } from './escopo/escopo';
import { EscopoApiModule } from './escopo-api/escopo-api.module';
import { HistoricoModule } from './historico/historico.module';
import { OcorrenciasModule } from './ocorrencias/ocorrencias.module';

/** Contexto `escala`: frentes, turnos, alocações, ausências e o recorte da gestora de escala. */
@Module({
  imports: [
    AlocacoesModule,
    AusenciasModule,
    CadastrosEscalaModule,
    EscopoApiModule,
    HistoricoModule,
    OcorrenciasModule,
  ],
  providers: [{ provide: ESCOPO_ESCALA_REPOSITORY, useClass: DrizzleEscopoEscalaRepository }],
  exports: [ESCOPO_ESCALA_REPOSITORY],
})
export class EscalaModule {}
