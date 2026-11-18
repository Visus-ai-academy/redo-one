import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  clientes,
  designacoes,
  especialidades,
  exames,
  medicos,
  medicosDistribuicao,
  modalidades,
} from '../../../database/schema';
import type { AmostraCatalogo } from './fila-sintetica';

/**
 * O que a fila sintética sorteia: exames e clientes ativos do catálogo do redo-one (o cliente
 * principal, não as unidades), as contas na MobileMed dos médicos habilitados no robô e a última
 * entrega do robô de cada exame (para a MobileMed de mentira saber com quem cada um está).
 */
@Injectable()
export class DrizzleAmostraCatalogo {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async carregar(): Promise<AmostraCatalogo> {
    const [listaExames, listaClientes, listaMedicos, entregues] = await Promise.all([
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
      this.db
        .selectDistinctOn([designacoes.idExameMobilemed], {
          idExame: designacoes.idExameMobilemed,
          idMobilemed: medicos.idMobilemed,
        })
        .from(designacoes)
        .innerJoin(medicos, eq(medicos.id, designacoes.medicoId))
        .where(and(eq(designacoes.status, 'executada'), isNotNull(medicos.idMobilemed)))
        .orderBy(designacoes.idExameMobilemed, desc(designacoes.executadaEm)),
    ]);
    return {
      exames: listaExames,
      clientes: listaClientes.map((c) => c.nome),
      medicosMobilemed: listaMedicos.flatMap((m) =>
        m.idMobilemed === null ? [] : [m.idMobilemed],
      ),
      entregues: entregues.flatMap((e) =>
        e.idMobilemed === null ? [] : [{ idExame: e.idExame, medicoIdMobilemed: e.idMobilemed }],
      ),
    };
  }
}
