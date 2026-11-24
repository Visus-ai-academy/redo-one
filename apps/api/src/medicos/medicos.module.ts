import { Module } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../auditoria/auditoria';
import { DrizzleListaRepository } from '../catalogo/listas/drizzle-lista.repository';
import { ListaService } from '../catalogo/listas/listas.service';
import { DATABASE, type Database } from '../database/database';
import { CLOCK, type Clock, systemClock } from '../identidade/clock';
import { ALIASES_MEDICO_REPOSITORY } from './aliases/aliases-medico.repository';
import { AliasesMedicoService } from './aliases/aliases-medico.service';
import { DrizzleMedicosRepository } from './cadastro/drizzle-medicos.repository';
import { MedicosController } from './cadastro/medicos.controller';
import { MEDICOS_REPOSITORY, type MedicosRepository } from './cadastro/medicos.repository';
import { MedicosService } from './cadastro/medicos.service';
import { DrizzleEquipesRepository } from './equipes/drizzle-equipes.repository';
import { EquipesController } from './equipes/equipes.controller';
import { EquipesService } from './equipes/equipes.service';
import { NiveisMedicoController } from './niveis/niveis.controller';
import { TABELA_NIVEIS } from './niveis/tabela';
import { NIVEIS_MEDICO, NIVEIS_MEDICO_SERVICE } from './niveis/tokens';
import { OUTRAS_CONTAS_MEDICO_REPOSITORY } from './outras-contas/outras-contas-medico.repository';
import { OutrasContasMedicoService } from './outras-contas/outras-contas-medico.service';
import { DrizzlePagamentoMedicoRepository } from './pagamento/drizzle-pagamento-medico.repository';
import { PAGAMENTO_MEDICO_REPOSITORY } from './pagamento/pagamento-medico.repository';
import { PagamentoMedicoService } from './pagamento/pagamento-medico.service';

const ROTULO_NIVEL = { entidade: 'nivel_medico', singular: 'Nível', genero: 'm' } as const;

/** Contexto `medicos`: cadastro, níveis, apelidos, outras contas na MobileMed, dados de pagamento e equipes. */
@Module({
  controllers: [MedicosController, EquipesController, NiveisMedicoController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    MedicosService,
    AliasesMedicoService,
    OutrasContasMedicoService,
    PagamentoMedicoService,
    DrizzleMedicosRepository,
    { provide: MEDICOS_REPOSITORY, useExisting: DrizzleMedicosRepository },
    { provide: ALIASES_MEDICO_REPOSITORY, useExisting: DrizzleMedicosRepository },
    { provide: OUTRAS_CONTAS_MEDICO_REPOSITORY, useExisting: DrizzleMedicosRepository },
    { provide: PAGAMENTO_MEDICO_REPOSITORY, useClass: DrizzlePagamentoMedicoRepository },
    {
      provide: NIVEIS_MEDICO,
      inject: [DATABASE],
      useFactory: (db: Database) => new DrizzleListaRepository(db, TABELA_NIVEIS),
    },
    {
      provide: NIVEIS_MEDICO_SERVICE,
      inject: [NIVEIS_MEDICO, AUDITORIA, CLOCK],
      useFactory: (repo: DrizzleListaRepository, auditoria: Auditoria, clock: Clock) =>
        new ListaService(ROTULO_NIVEL, repo, auditoria, clock),
    },
    {
      provide: EquipesService,
      inject: [DATABASE, MEDICOS_REPOSITORY, AUDITORIA, CLOCK],
      useFactory: (db: Database, medicos: MedicosRepository, auditoria: Auditoria, clock: Clock) =>
        new EquipesService(new DrizzleEquipesRepository(db), medicos, auditoria, clock),
    },
  ],
})
export class MedicosModule {}
