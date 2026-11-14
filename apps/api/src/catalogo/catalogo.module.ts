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
import type { Rotulo } from './comum/rotulo';
import { ContratadosController } from './contratados/contratados.controller';
import { CONTRATADOS_REPOSITORY } from './contratados/contratados.repository';
import { ContratadosService } from './contratados/contratados.service';
import { DrizzleContratadosRepository } from './contratados/drizzle-contratados.repository';
import { DrizzleExamesRepository } from './exames/drizzle-exames.repository';
import { ExamesController } from './exames/exames.controller';
import { EXAMES_REPOSITORY } from './exames/exames.repository';
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

/** Contexto `catalogo`: listas do domínio, exames, de-paras, contratados e clientes. */
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
  ],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    ContratadosService,
    ExamesService,
    { provide: EXAMES_REPOSITORY, useClass: DrizzleExamesRepository },
    ClientesService,
    AliasesClienteService,
    DrizzleClientesRepository,
    { provide: CLIENTES_REPOSITORY, useExisting: DrizzleClientesRepository },
    { provide: ALIASES_CLIENTE_REPOSITORY, useExisting: DrizzleClientesRepository },
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
  ],
})
export class CatalogoModule {}
