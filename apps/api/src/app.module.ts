import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { APP_FILTER } from '@nestjs/core';

import { AuditoriaModule } from './auditoria/auditoria.module';
import { HistoricoCadastroModule } from './auditoria/historico-cadastro/historico-cadastro.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { ComumModule } from './comum/comum.module';
import { ErroDeDominioFilter } from './comum/erro-de-dominio.filter';
import { validarAmbiente } from './config/ambiente';
import { DatabaseModule } from './database/database.module';
import { DistribuicaoModule } from './distribuicao/distribuicao.module';
import { GatilhosDistribuicaoModule } from './distribuicao/infrastructure/catalogo/gatilhos-distribuicao.module';
import { EscalaModule } from './escala/escala.module';
import { FaturamentoModule } from './faturamento/faturamento.module';
import { GatilhosTipificacaoModule } from './faturamento/infrastructure/jobs/gatilhos-tipificacao.module';
import { IdentidadeModule } from './identidade/identidade.module';
import { AvisosCompartilhadosModule } from './ingestao/infrastructure/avisos/avisos-compartilhados.module';
import { GatilhosIngestaoModule } from './ingestao/infrastructure/jobs/gatilhos-ingestao.module';
import { IngestaoModule } from './ingestao/ingestao.module';
import { MedicosModule } from './medicos/medicos.module';
import { RepasseModule } from './repasse/repasse.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarAmbiente }),
    DatabaseModule,
    ComumModule,
    AuditoriaModule,
    IdentidadeModule,
    CatalogoModule,
    GatilhosTipificacaoModule,
    GatilhosIngestaoModule,
    GatilhosDistribuicaoModule,
    AvisosCompartilhadosModule,
    MedicosModule,
    EscalaModule,
    FaturamentoModule,
    RepasseModule,
    IngestaoModule,
    DistribuicaoModule,
    HistoricoCadastroModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ErroDeDominioFilter }],
})
export class AppModule {}
