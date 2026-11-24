import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, inArray, isNotNull } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { medicos, medicosContasMobilemed, medicosDistribuicao } from '../../../database/schema';
import type { MedicoDaConta, MedicosRodada } from '../../application/ports/insumos-rodada';

/** O cadastro dos médicos como a rodada o consulta na hora (conta na MobileMed, ativo, robô). */
@Injectable()
export class DrizzleMedicosRodada implements MedicosRodada {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async habilitados(): Promise<number> {
    const [linha] = await this.db
      .select({ n: count() })
      .from(medicos)
      .innerJoin(medicosDistribuicao, eq(medicosDistribuicao.medicoId, medicos.id))
      .where(and(eq(medicos.ativo, true), eq(medicosDistribuicao.habilitadoRobo, true)));
    return linha?.n ?? 0;
  }

  async doCadastro(ids: readonly string[]): Promise<Map<string, MedicoDaConta>> {
    if (!ids.length) return new Map();
    const linhas = await this.db
      .select({
        id: medicos.id,
        nome: medicos.nome,
        ativo: medicos.ativo,
        idMobilemed: medicos.idMobilemed,
        habilitadoRobo: medicosDistribuicao.habilitadoRobo,
      })
      .from(medicos)
      .leftJoin(medicosDistribuicao, eq(medicosDistribuicao.medicoId, medicos.id))
      .where(inArray(medicos.id, [...ids]));
    const outras = await this.db
      .select({
        medicoId: medicosContasMobilemed.medicoId,
        idMobilemed: medicosContasMobilemed.idMobilemed,
      })
      .from(medicosContasMobilemed)
      .where(inArray(medicosContasMobilemed.medicoId, [...ids]));
    const outrasDe = (id: string) =>
      outras.filter((c) => c.medicoId === id).map((c) => c.idMobilemed);
    return new Map(
      linhas.map((m) => [
        m.id,
        { ...m, habilitadoRobo: m.habilitadoRobo ?? false, outrasContas: outrasDe(m.id) },
      ]),
    );
  }

  async buscar(termo: string, limite: number): Promise<MedicoDaConta[]> {
    const padrao = `%${termo.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const linhas = await this.db
      .select({
        id: medicos.id,
        nome: medicos.nome,
        ativo: medicos.ativo,
        idMobilemed: medicos.idMobilemed,
        habilitadoRobo: medicosDistribuicao.habilitadoRobo,
      })
      .from(medicos)
      .leftJoin(medicosDistribuicao, eq(medicosDistribuicao.medicoId, medicos.id))
      .where(
        and(eq(medicos.ativo, true), isNotNull(medicos.idMobilemed), ilike(medicos.nome, padrao)),
      )
      .orderBy(asc(medicos.nome))
      .limit(limite);
    return linhas.map((m) => ({ ...m, habilitadoRobo: m.habilitadoRobo ?? false }));
  }
}
