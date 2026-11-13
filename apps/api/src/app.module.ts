import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { APP_FILTER } from '@nestjs/core';

import { AuditoriaModule } from './auditoria/auditoria.module';
import { ComumModule } from './comum/comum.module';
import { ErroDeDominioFilter } from './comum/erro-de-dominio.filter';
import { DatabaseModule } from './database/database.module';
import { IdentidadeModule } from './identidade/identidade.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    ComumModule,
    AuditoriaModule,
    IdentidadeModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ErroDeDominioFilter }],
})
export class AppModule {}
