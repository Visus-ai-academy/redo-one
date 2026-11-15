import { Module, type Provider } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import { DATABASE, type Database } from '../database/database';
import { CLOCK, type Clock, systemClock } from '../identidade/clock';
import { ALIASES_CLIENTE_REPOSITORY } from './clientes/aliases-cliente.repository';
import { AliasesClienteService } from './clientes/aliases-cliente.service';
import { ClientesController } from './clientes/clientes.controller';
import { CLIENTES_REPOSITORY } from './clientes/clientes.repository';
import { ClientesService } from './clientes/clientes.service';
import { DrizzleClientesRepository } from './clientes/drizzle-clientes.repository';
import { UNIDADES_CLIENTE_REPOSITORY } from './clientes/unidades-cliente.repository';
import { UnidadesClienteService } from './clientes/unidades-cliente.service';
import type { Rotulo } from './comum/rotulo';
import { ContratadosController } from './contratados/contratados.controller';
import {
  CONTRATADOS_REPOSITORY,
  type ContratadosRepository,
} from './contratados/contratados.repository';
import { ContratadosService } from './contratados/contratados.service';
import { DrizzleContratadosRepository } from './contratados/drizzle-contratados.repository';
import {
  DeParaEspecialidadesController,
  DeParaModalidadesController,
  DeParaPrioridadesController,
  DeParaValoresExameController,
  SufixosClienteController,
} from './de-para/de-para.controller';
import { DeParaService } from './de-para/de-para.service';
import {
  criarRepoDePara,
  TABELA_DE_PARA_ESPECIALIDADE,
  TABELA_DE_PARA_MODALIDADE,
  TABELA_DE_PARA_PRIORIDADE,
  TABELA_DE_PARA_VALOR,
  TABELA_SUFIXO,
  type TabelaDePara,
} from './de-para/drizzle-de-para.repository';
import {
  REGRA_ESPECIALIDADE,
  REGRA_MODALIDADE,
  REGRA_PRIORIDADE,
  REGRA_SUFIXO,
  REGRA_VALOR_EXAME,
  type RegraDePara,
} from './de-para/regras';
import {
  DE_PARA_ESPECIALIDADE,
  DE_PARA_MODALIDADE,
  DE_PARA_PRIORIDADE,
  DE_PARA_VALOR,
  SUFIXOS_CLIENTE,
} from './de-para/tokens';
import { DrizzleExamesRepository } from './exames/drizzle-exames.repository';
import { ExamesController } from './exames/exames.controller';
import { EXAMES_REPOSITORY, type ExamesRepository } from './exames/exames.repository';
import { ExamesService } from './exames/exames.service';
import {
  DrizzleListaRepository,
  LISTAS,
  type TabelaDeLista,
} from './listas/drizzle-lista.repository';
import {
  CategoriasExameController,
  EspecialidadesController,
  ModalidadesController,
  PrioridadesController,
} from './listas/listas.controller';
import { ListaService } from './listas/listas.service';
import { CATEGORIAS_EXAME, ESPECIALIDADES, MODALIDADES, PRIORIDADES } from './listas/tokens';
import { OpcoesController } from './opcoes/opcoes.controller';
import { OpcoesService } from './opcoes/opcoes.service';
import { DrizzleQuebrasRepository } from './quebras/drizzle-quebras.repository';
import { QuebrasController } from './quebras/quebras.controller';
import { QUEBRAS_REPOSITORY } from './quebras/quebras.repository';
import { QuebrasService } from './quebras/quebras.service';
import { DrizzleSubespecialidadesRepository } from './subespecialidades/drizzle-subespecialidades.repository';
import { SubespecialidadesController } from './subespecialidades/subespecialidades.controller';
import { SubespecialidadesService } from './subespecialidades/subespecialidades.service';

/** Um `ListaService` para a lista: o rótulo das mensagens e a tabela onde ela fica. */
function lista(token: symbol, rotulo: Rotulo, tabela: TabelaDeLista): Provider {
  return {
    provide: token,
    inject: [DATABASE, AUDITORIA, CLOCK],
    useFactory: (db: Database, auditoria: Auditoria, clock: Clock) =>
      new ListaService(rotulo, new DrizzleListaRepository(db, tabela), auditoria, clock),
  };
}

/** Um `DeParaService` para a tabela: a regra (validação e chave) e onde ela fica. */
function dePara<D extends object>(
  token: symbol,
  regra: (db: Database) => RegraDePara<D>,
  tabela: TabelaDePara<D>,
): Provider {
  return {
    provide: token,
    inject: [DATABASE, AUDITORIA, CLOCK],
    useFactory: (db: Database, auditoria: Auditoria, clock: Clock) =>
      new DeParaService(regra(db), criarRepoDePara(db, tabela), auditoria, clock),
  };
}

/** Contexto `catalogo`: listas do domínio, exames e quebras, de-paras, contratados e clientes. */
@Module({
  controllers: [
    ModalidadesController,
    EspecialidadesController,
    CategoriasExameController,
    PrioridadesController,
    SubespecialidadesController,
    ContratadosController,
    ClientesController,
    ExamesController,
    QuebrasController,
    DeParaModalidadesController,
    DeParaPrioridadesController,
    DeParaEspecialidadesController,
    DeParaValoresExameController,
    SufixosClienteController,
    OpcoesController,
  ],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    ContratadosService,
    ExamesService,
    { provide: EXAMES_REPOSITORY, useClass: DrizzleExamesRepository },
    QuebrasService,
    { provide: QUEBRAS_REPOSITORY, useClass: DrizzleQuebrasRepository },
    ClientesService,
    AliasesClienteService,
    UnidadesClienteService,
    DrizzleClientesRepository,
    { provide: CLIENTES_REPOSITORY, useExisting: DrizzleClientesRepository },
    { provide: ALIASES_CLIENTE_REPOSITORY, useExisting: DrizzleClientesRepository },
    { provide: UNIDADES_CLIENTE_REPOSITORY, useExisting: DrizzleClientesRepository },
    { provide: CONTRATADOS_REPOSITORY, useClass: DrizzleContratadosRepository },
    lista(
      MODALIDADES,
      { entidade: 'modalidade', singular: 'Modalidade', genero: 'f' },
      LISTAS.modalidades,
    ),
    lista(
      ESPECIALIDADES,
      { entidade: 'especialidade', singular: 'Especialidade', genero: 'f' },
      LISTAS.especialidades,
    ),
    lista(
      CATEGORIAS_EXAME,
      { entidade: 'categoria_exame', singular: 'Categoria', genero: 'f' },
      LISTAS.categoriasExame,
    ),
    lista(
      PRIORIDADES,
      { entidade: 'prioridade', singular: 'Prioridade', genero: 'f' },
      LISTAS.prioridades,
    ),
    {
      provide: SubespecialidadesService,
      inject: [DATABASE, AUDITORIA, CLOCK],
      useFactory: (db: Database, auditoria: Auditoria, clock: Clock) =>
        new SubespecialidadesService(
          new DrizzleSubespecialidadesRepository(db),
          new DrizzleListaRepository(db, LISTAS.especialidades),
          auditoria,
          clock,
        ),
    },
    dePara(DE_PARA_PRIORIDADE, () => REGRA_PRIORIDADE, TABELA_DE_PARA_PRIORIDADE),
    dePara(DE_PARA_MODALIDADE, () => REGRA_MODALIDADE, TABELA_DE_PARA_MODALIDADE),
    dePara(
      DE_PARA_ESPECIALIDADE,
      (db) => REGRA_ESPECIALIDADE(new DrizzleListaRepository(db, LISTAS.especialidades)),
      TABELA_DE_PARA_ESPECIALIDADE,
    ),
    dePara(DE_PARA_VALOR, () => REGRA_VALOR_EXAME, TABELA_DE_PARA_VALOR),
    dePara(SUFIXOS_CLIENTE, () => REGRA_SUFIXO, TABELA_SUFIXO),
    {
      provide: OpcoesService,
      inject: [DATABASE, CONTRATADOS_REPOSITORY, EXAMES_REPOSITORY],
      useFactory: (db: Database, contratados: ContratadosRepository, exames: ExamesRepository) =>
        new OpcoesService(
          {
            modalidades: new DrizzleListaRepository(db, LISTAS.modalidades),
            especialidades: new DrizzleListaRepository(db, LISTAS.especialidades),
            subespecialidades: new DrizzleSubespecialidadesRepository(db),
            categoriasExame: new DrizzleListaRepository(db, LISTAS.categoriasExame),
            prioridades: new DrizzleListaRepository(db, LISTAS.prioridades),
          },
          contratados,
          exames,
        ),
    },
  ],
})
export class CatalogoModule {}
