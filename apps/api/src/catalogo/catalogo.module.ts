import { Module, type Provider } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import { DATABASE, type Database } from '../database/database';
import { CLOCK, type Clock, systemClock } from '../identidade/clock';
import type { Rotulo } from './comum/rotulo';
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
  ],
  providers: [
    { provide: CLOCK, useValue: systemClock },
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
  ],
})
export class CatalogoModule {}
