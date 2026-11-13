import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditoriaModule } from './auditoria/auditoria.module';
import { DatabaseModule } from './database/database.module';
import { IdentidadeModule } from './identidade/identidade.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuditoriaModule,
    IdentidadeModule,
  ],
})
export class AppModule {}
