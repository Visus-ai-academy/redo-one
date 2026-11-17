import { Module } from '@nestjs/common';

import { DrizzleHistoricoCadastroRepository } from './drizzle-historico-cadastro.repository';
import { HistoricoCadastroController } from './historico-cadastro.controller';
import { HISTORICO_CADASTRO_REPOSITORY } from './historico-cadastro.repository';
import { HistoricoCadastroService } from './historico-cadastro.service';

/** Histórico (log de mudanças) dos cadastros de médico, cliente e exame, lido da auditoria. */
@Module({
  controllers: [HistoricoCadastroController],
  providers: [
    HistoricoCadastroService,
    { provide: HISTORICO_CADASTRO_REPOSITORY, useClass: DrizzleHistoricoCadastroRepository },
  ],
})
export class HistoricoCadastroModule {}
