import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { APP_FILTER } from '@nestjs/core';

import { AuditoriaModule } from './auditoria/auditoria.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { ComumModule } from './comum/comum.module';
import { ErroDeDominioFilter } from './comum/erro-de-dominio.filter';
import { validarAmbiente } from './config/ambiente';
import { DatabaseModule } from './database/database.module';
import { EscalaModule } from './escala/escala.module';
import { IdentidadeModule } from './identidade/identidade.module';
import { IngestaoModule } from './ingestao/ingestao.module';
import { MedicosModule } from './medicos/medicos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarAmbiente }),
    DatabaseModule,
    ComumModule,
    AuditoriaModule,
    IdentidadeModule,
    CatalogoModule,
    MedicosModule,
    EscalaModule,
    IngestaoModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ErroDeDominioFilter }],
})
export class AppModule {}
