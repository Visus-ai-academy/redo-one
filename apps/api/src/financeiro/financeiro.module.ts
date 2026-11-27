import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import { CLOCK, type Clock, systemClock } from '../identidade/clock';
import {
  CATEGORIAS_REPOSITORY,
  type CategoriasRepository,
} from './application/ports/categorias.repository';
import {
  CONTAS_BANCARIAS_REPOSITORY,
  type ContasBancariasRepository,
} from './application/ports/contas-bancarias.repository';
import { EMISSOR_NFSE } from './application/ports/emissor-nfse';
import { EMPRESAS_FINANCEIRO, type EmpresasFinanceiro } from './application/ports/empresas';
import { VARIAVEIS_AMBIENTE, type VariaveisAmbiente } from './application/ports/variaveis-ambiente';
import {
  ConsultarCategorias,
  ExcluirCategoria,
  SalvarCategoria,
} from './application/use-cases/categorias';
import {
  ConsultarContasBancarias,
  ExcluirContaBancaria,
  ListarEmpresas,
  SalvarContaBancaria,
} from './application/use-cases/contas-bancarias';
import { criarEmissorNfse } from './infrastructure/criar-emissor-nfse';
import { CategoriasFinanceirasController } from './infrastructure/http/categorias-financeiras.controller';
import {
  ContasBancariasController,
  EmpresasFinanceiroController,
} from './infrastructure/http/contas-bancarias.controller';
import { DrizzleCategoriasRepository } from './infrastructure/persistence/drizzle-categorias.repository';
import { DrizzleContasBancariasRepository } from './infrastructure/persistence/drizzle-contas-bancarias.repository';
import { DrizzleEmpresas } from './infrastructure/persistence/drizzle-empresas';
import { variaveisDoConfig } from './infrastructure/variaveis-ambiente-config';

/**
 * Contexto financeiro: plano de categorias, contas bancárias (e, a seguir, fornecedores, títulos)
 * e a integração de saída com a Focus NFe (ou o simulador).
 */
@Module({
  controllers: [
    CategoriasFinanceirasController,
    ContasBancariasController,
    EmpresasFinanceiroController,
  ],
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
    { provide: CONTAS_BANCARIAS_REPOSITORY, useClass: DrizzleContasBancariasRepository },
    { provide: EMPRESAS_FINANCEIRO, useClass: DrizzleEmpresas },
    {
      provide: VARIAVEIS_AMBIENTE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => variaveisDoConfig(config),
    },
    {
      provide: ListarEmpresas,
      inject: [EMPRESAS_FINANCEIRO],
      useFactory: (empresas: EmpresasFinanceiro) => new ListarEmpresas(empresas),
    },
    {
      provide: ConsultarContasBancarias,
      inject: [CONTAS_BANCARIAS_REPOSITORY, VARIAVEIS_AMBIENTE],
      useFactory: (repo: ContasBancariasRepository, variaveis: VariaveisAmbiente) =>
        new ConsultarContasBancarias(repo, variaveis),
    },
    {
      provide: SalvarContaBancaria,
      inject: [CONTAS_BANCARIAS_REPOSITORY, EMPRESAS_FINANCEIRO, AUDITORIA, CLOCK],
      useFactory: (
        repo: ContasBancariasRepository,
        empresas: EmpresasFinanceiro,
        auditoria: Auditoria,
        clock: Clock,
      ) => new SalvarContaBancaria(repo, empresas, auditoria, clock),
    },
    {
      provide: ExcluirContaBancaria,
      inject: [CONTAS_BANCARIAS_REPOSITORY, AUDITORIA, CLOCK],
      useFactory: (repo: ContasBancariasRepository, auditoria: Auditoria, clock: Clock) =>
        new ExcluirContaBancaria(repo, auditoria, clock),
    },
  ],
  exports: [EMISSOR_NFSE],
})
export class FinanceiroModule {}
