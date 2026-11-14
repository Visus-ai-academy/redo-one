import { Module, type Provider } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import { DATABASE, type Database } from '../database/database';
import { CLOCK, type Clock, systemClock } from '../identidade/clock';
import type { Rotulo } from './comum/rotulo';
import { ContratadosController } from './contratados/contratados.controller';
import { CONTRATADOS_REPOSITORY } from './contratados/contratados.repository';
import { ContratadosService } from './contratados/contratados.service';
import { DrizzleContratadosRepository } from './contratados/drizzle-contratados.repository';
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
  ],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    ContratadosService,
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
