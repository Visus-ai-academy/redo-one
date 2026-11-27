import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import { CLOCK, type Clock, systemClock } from '../identidade/clock';
import {
  CATEGORIAS_REPOSITORY,
  type CategoriasRepository,
} from './application/ports/categorias.repository';
import { EMISSOR_NFSE } from './application/ports/emissor-nfse';
import {
  ConsultarCategorias,
  ExcluirCategoria,
  SalvarCategoria,
} from './application/use-cases/categorias';
import { criarEmissorNfse } from './infrastructure/criar-emissor-nfse';
import { CategoriasFinanceirasController } from './infrastructure/http/categorias-financeiras.controller';
import { DrizzleCategoriasRepository } from './infrastructure/persistence/drizzle-categorias.repository';

/**
 * Contexto financeiro: plano de categorias (e, a seguir, contas bancárias, fornecedores, títulos)
 * e a integração de saída com a Focus NFe (ou o simulador).
 */
@Module({
  controllers: [CategoriasFinanceirasController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    {
      provide: EMISSOR_NFSE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        criarEmissorNfse({ get: (nome) => config.get<string>(nome) }),
    },
    { provide: CATEGORIAS_REPOSITORY, useClass: DrizzleCategoriasRepository },
    {
      provide: ConsultarCategorias,
      inject: [CATEGORIAS_REPOSITORY],
      useFactory: (repo: CategoriasRepository) => new ConsultarCategorias(repo),
    },
    {
      provide: SalvarCategoria,
      inject: [CATEGORIAS_REPOSITORY, AUDITORIA, CLOCK],
      useFactory: (repo: CategoriasRepository, auditoria: Auditoria, clock: Clock) =>
        new SalvarCategoria(repo, auditoria, clock),
    },
    {
      provide: ExcluirCategoria,
      inject: [CATEGORIAS_REPOSITORY, AUDITORIA, CLOCK],
      useFactory: (repo: CategoriasRepository, auditoria: Auditoria, clock: Clock) =>
        new ExcluirCategoria(repo, auditoria, clock),
    },
  ],
  exports: [EMISSOR_NFSE],
})
export class FinanceiroModule {}
