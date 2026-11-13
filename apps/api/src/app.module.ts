import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from './database/database.module';
import { IdentidadeModule } from './identidade/identidade.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, IdentidadeModule],
})
export class AppModule {}
