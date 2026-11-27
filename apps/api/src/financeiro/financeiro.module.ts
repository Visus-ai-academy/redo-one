import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EMISSOR_NFSE } from './application/ports/emissor-nfse';
import { criarEmissorNfse } from './infrastructure/criar-emissor-nfse';

/**
 * Contexto financeiro (planejado). Por enquanto só liga a integração de saída com a Focus NFe
 * (ou o simulador); casos de uso, tabelas e telas entram com o desenho do contexto.
 */
@Module({
  providers: [
    {
      provide: EMISSOR_NFSE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        criarEmissorNfse({ get: (nome) => config.get<string>(nome) }),
    },
  ],
  exports: [EMISSOR_NFSE],
})
export class FinanceiroModule {}
