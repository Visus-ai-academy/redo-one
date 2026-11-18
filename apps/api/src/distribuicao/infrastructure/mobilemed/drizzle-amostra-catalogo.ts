import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  clientes,
  especialidades,
  exames,
  medicos,
  medicosDistribuicao,
  modalidades,
} from '../../../database/schema';
import type { AmostraCatalogo } from './fila-sintetica';

/**
 * O que a fila sintética sorteia: exames e clientes ativos do catálogo do redo-one (o cliente
 * principal, não as unidades) e as contas na MobileMed dos médicos habilitados no robô.
 */
@Injectable()
export class DrizzleAmostraCatalogo {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async carregar(): Promise<AmostraCatalogo> {
    const [listaExames, listaClientes, listaMedicos] = await Promise.all([
      this.db
        .select({
          nome: exames.nome,
          modalidade: modalidades.codigo,
          especialidade: especialidades.nome,
        })
        .from(exames)
        .leftJoin(modalidades, eq(modalidades.id, exames.modalidadeId))
        .leftJoin(especialidades, eq(especialidades.id, exames.especialidadeId))
        .where(eq(exames.ativo, true))
        .orderBy(asc(exames.nome), asc(exames.id)),
      this.db
        .select({ nome: clientes.nome })
        .from(clientes)
        .where(and(eq(clientes.ativo, true), isNull(clientes.unificadoEmId)))
        .orderBy(asc(clientes.nome)),
      this.db
        .select({ idMobilemed: medicos.idMobilemed })
        .from(medicos)
        .innerJoin(medicosDistribuicao, eq(medicosDistribuicao.medicoId, medicos.id))
        .where(
          and(
            eq(medicos.ativo, true),
            eq(medicosDistribuicao.habilitadoRobo, true),
            isNotNull(medicos.idMobilemed),
          ),
        )
        .orderBy(asc(medicos.idMobilemed)),
    ]);
    return {
      exames: listaExames,
      clientes: listaClientes.map((c) => c.nome),
      medicosMobilemed: listaMedicos.flatMap((m) =>
        m.idMobilemed === null ? [] : [m.idMobilemed],
      ),
    };
  }
}
