import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import { CLOCK, type Clock, systemClock } from '../identidade/clock';
import {
  CATEGORIAS_REPOSITORY,
  type CategoriasRepository,
} from './application/ports/categorias.repository';
import {
  CONFIGURACOES_FINANCEIRAS,
  type ConfiguracoesFinanceiras,
  INADIMPLENCIA,
  type Inadimplencia,
} from './application/ports/configuracoes-financeiras';
import {
  CONTAS_BANCARIAS_REPOSITORY,
  type ContasBancariasRepository,
} from './application/ports/contas-bancarias.repository';
import { EMISSOR_NFSE } from './application/ports/emissor-nfse';
import { EMPRESAS_FINANCEIRO, type EmpresasFinanceiro } from './application/ports/empresas';
import {
  FORNECEDORES_REPOSITORY,
  type FornecedoresRepository,
} from './application/ports/fornecedores.repository';
import {
  FAVORECIDOS,
  type Favorecidos,
  TITULOS_REPOSITORY,
  type TitulosRepository,
} from './application/ports/titulos.repository';
import { VARIAVEIS_AMBIENTE, type VariaveisAmbiente } from './application/ports/variaveis-ambiente';
import {
  ConsultarCategorias,
  ExcluirCategoria,
  SalvarCategoria,
} from './application/use-cases/categorias';
import {
  ConsultarConfiguracoes,
  ConsultarInadimplencia,
  SalvarConfiguracao,
} from './application/use-cases/configuracoes';
import {
  ConsultarContasBancarias,
  ExcluirContaBancaria,
  ListarEmpresas,
  SalvarContaBancaria,
} from './application/use-cases/contas-bancarias';
import {
  ConsultarFornecedores,
  ExcluirFornecedor,
  SalvarFornecedor,
} from './application/use-cases/fornecedores';
import {
  BaixasTitulo,
  CancelarTitulo,
  ConsultarTitulos,
  ContextoDoTitulo,
  OpcoesDeFavorecido,
  SalvarTitulo,
} from './application/use-cases/titulos';
import { criarEmissorNfse } from './infrastructure/criar-emissor-nfse';
import { CategoriasFinanceirasController } from './infrastructure/http/categorias-financeiras.controller';
import {
  ConfiguracoesFinanceirasController,
  InadimplenciaController,
} from './infrastructure/http/configuracoes.controller';
import {
  ContasBancariasController,
  EmpresasFinanceiroController,
} from './infrastructure/http/contas-bancarias.controller';
import { FornecedoresController } from './infrastructure/http/fornecedores.controller';
import {
  ContasPagarTitulosController,
  ContasReceberTitulosController,
} from './infrastructure/http/titulos.controller';
import { DrizzleCategoriasRepository } from './infrastructure/persistence/drizzle-categorias.repository';
import {
  DrizzleConfiguracoesFinanceiras,
  DrizzleInadimplencia,
} from './infrastructure/persistence/drizzle-configuracoes-financeiras';
import { DrizzleContasBancariasRepository } from './infrastructure/persistence/drizzle-contas-bancarias.repository';
import { DrizzleEmpresas } from './infrastructure/persistence/drizzle-empresas';
import { DrizzleFavorecidos } from './infrastructure/persistence/drizzle-favorecidos';
import { DrizzleFornecedoresRepository } from './infrastructure/persistence/drizzle-fornecedores.repository';
import { DrizzleTitulosRepository } from './infrastructure/persistence/drizzle-titulos.repository';
import { variaveisDoConfig } from './infrastructure/variaveis-ambiente-config';

/**
 * Contexto financeiro: plano de categorias, contas bancárias, fornecedores, títulos a pagar e a
 * receber com as baixas, inadimplência, regras financeiras por empresa e a integração de saída com
 * a Focus NFe (ou o simulador).
 */
@Module({
  controllers: [
    CategoriasFinanceirasController,
    ContasBancariasController,
    EmpresasFinanceiroController,
    FornecedoresController,
    ContasPagarTitulosController,
    ContasReceberTitulosController,
    InadimplenciaController,
    ConfiguracoesFinanceirasController,
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
    { provide: FORNECEDORES_REPOSITORY, useClass: DrizzleFornecedoresRepository },
    {
      provide: ConsultarFornecedores,
      inject: [FORNECEDORES_REPOSITORY],
      useFactory: (repo: FornecedoresRepository) => new ConsultarFornecedores(repo),
    },
    {
      provide: SalvarFornecedor,
      inject: [FORNECEDORES_REPOSITORY, CATEGORIAS_REPOSITORY, AUDITORIA, CLOCK],
      useFactory: (
        repo: FornecedoresRepository,
        categorias: CategoriasRepository,
        auditoria: Auditoria,
        clock: Clock,
      ) => new SalvarFornecedor(repo, categorias, auditoria, clock),
    },
    {
      provide: ExcluirFornecedor,
      inject: [FORNECEDORES_REPOSITORY, AUDITORIA, CLOCK],
      useFactory: (repo: FornecedoresRepository, auditoria: Auditoria, clock: Clock) =>
        new ExcluirFornecedor(repo, auditoria, clock),
    },
    { provide: TITULOS_REPOSITORY, useClass: DrizzleTitulosRepository },
    { provide: FAVORECIDOS, useClass: DrizzleFavorecidos },
    {
      provide: ContextoDoTitulo,
      inject: [
        EMPRESAS_FINANCEIRO,
        CATEGORIAS_REPOSITORY,
        CONTAS_BANCARIAS_REPOSITORY,
        FAVORECIDOS,
      ],
      useFactory: (
        empresas: EmpresasFinanceiro,
        categorias: CategoriasRepository,
        contas: ContasBancariasRepository,
        favorecidos: Favorecidos,
      ) => new ContextoDoTitulo(empresas, categorias, contas, favorecidos),
    },
    {
      provide: ConsultarTitulos,
      inject: [TITULOS_REPOSITORY, CLOCK],
      useFactory: (repo: TitulosRepository, clock: Clock) => new ConsultarTitulos(repo, clock),
    },
    {
      provide: SalvarTitulo,
      inject: [TITULOS_REPOSITORY, ContextoDoTitulo, AUDITORIA, CLOCK],
      useFactory: (
        repo: TitulosRepository,
        contexto: ContextoDoTitulo,
        auditoria: Auditoria,
        clock: Clock,
      ) => new SalvarTitulo(repo, contexto, auditoria, clock),
    },
    {
      provide: BaixasTitulo,
      inject: [TITULOS_REPOSITORY, CONTAS_BANCARIAS_REPOSITORY, AUDITORIA, CLOCK],
      useFactory: (
        repo: TitulosRepository,
        contas: ContasBancariasRepository,
        auditoria: Auditoria,
        clock: Clock,
      ) => new BaixasTitulo(repo, contas, auditoria, clock),
    },
    {
      provide: CancelarTitulo,
      inject: [TITULOS_REPOSITORY, AUDITORIA, CLOCK],
      useFactory: (repo: TitulosRepository, auditoria: Auditoria, clock: Clock) =>
        new CancelarTitulo(repo, auditoria, clock),
    },
    {
      provide: OpcoesDeFavorecido,
      inject: [FAVORECIDOS],
      useFactory: (favorecidos: Favorecidos) => new OpcoesDeFavorecido(favorecidos),
    },
    { provide: CONFIGURACOES_FINANCEIRAS, useClass: DrizzleConfiguracoesFinanceiras },
    { provide: INADIMPLENCIA, useClass: DrizzleInadimplencia },
    {
      provide: ConsultarConfiguracoes,
      inject: [EMPRESAS_FINANCEIRO, CONFIGURACOES_FINANCEIRAS],
      useFactory: (empresas: EmpresasFinanceiro, configs: ConfiguracoesFinanceiras) =>
        new ConsultarConfiguracoes(empresas, configs),
    },
    {
      provide: SalvarConfiguracao,
      inject: [EMPRESAS_FINANCEIRO, CONFIGURACOES_FINANCEIRAS, AUDITORIA, CLOCK],
      useFactory: (
        empresas: EmpresasFinanceiro,
        configs: ConfiguracoesFinanceiras,
        auditoria: Auditoria,
        clock: Clock,
      ) => new SalvarConfiguracao(empresas, configs, auditoria, clock),
    },
    {
      provide: ConsultarInadimplencia,
      inject: [INADIMPLENCIA, EMPRESAS_FINANCEIRO, CONFIGURACOES_FINANCEIRAS, CLOCK],
      useFactory: (
        fonte: Inadimplencia,
        empresas: EmpresasFinanceiro,
        configs: ConfiguracoesFinanceiras,
        clock: Clock,
      ) => new ConsultarInadimplencia(fonte, empresas, configs, clock),
    },
  ],
  exports: [EMISSOR_NFSE],
})
export class FinanceiroModule {}
