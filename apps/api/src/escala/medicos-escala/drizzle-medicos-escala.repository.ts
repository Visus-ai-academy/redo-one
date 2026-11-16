import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, type SQL } from 'drizzle-orm';

import { contem, relevancia } from '../../database/busca';
import { DATABASE, type Database } from '../../database/database';
import { medicos } from '../../database/schema';
import type {
  FiltroMedicosEscala,
  MedicoEscala,
  MedicosEscalaRepository,
} from './medicos-escala.repository';

const campos = { id: medicos.id, nome: medicos.nome, ativo: medicos.ativo };

@Injectable()
export class DrizzleMedicosEscalaRepository implements MedicosEscalaRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(filtro: FiltroMedicosEscala) {
    const condicoes: (SQL | undefined)[] = [];
    if (filtro.busca) condicoes.push(ilike(medicos.chaveNormalizada, contem(filtro.busca)));
    if (filtro.ativo !== undefined) condicoes.push(eq(medicos.ativo, filtro.ativo));
    const onde = and(...condicoes);

    const [itens, [totalLinha]] = await Promise.all([
      this.db
        .select(campos)
        .from(medicos)
        .where(onde)
        // Pela chave: "Dra. Rafaela" não vem antes de "Dr. Augusto".
        .orderBy(
          ...(filtro.busca ? relevancia(medicos.chaveNormalizada, filtro.busca) : []),
          asc(medicos.chaveNormalizada),
        )
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db.select({ total: count() }).from(medicos).where(onde),
    ]);
    return { itens, total: totalLinha?.total ?? 0 };
  }

  async buscar(id: string): Promise<MedicoEscala | null> {
    const [medico] = await this.db.select(campos).from(medicos).where(eq(medicos.id, id)).limit(1);
    return medico ?? null;
  }
}
