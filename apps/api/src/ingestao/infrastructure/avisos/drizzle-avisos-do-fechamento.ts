import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { avisosCadastro, tiposAviso } from '../../../database/schema';
import type { AvisosDoFechamento } from '../../../faturamento/application/ports/avisos-do-fechamento';
import { ligadoACompetencia } from '../persistence/drizzle-consulta-avisos';

/** A porta do `faturamento`: avisos pendentes, de tipo que impede fechar, ligados à competência. */
@Injectable()
export class DrizzleAvisosDoFechamento implements AvisosDoFechamento {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async queImpedem(competencia: string, limite: number) {
    const onde = and(
      eq(avisosCadastro.status, 'pendente'),
      eq(tiposAviso.impedeFecharCompetencia, true),
      ligadoACompetencia(competencia),
    );
    const [itens, [total]] = await Promise.all([
      this.db
        .select({ id: avisosCadastro.id, tipo: avisosCadastro.tipo, valor: avisosCadastro.valor })
        .from(avisosCadastro)
        .innerJoin(tiposAviso, eq(tiposAviso.tipo, avisosCadastro.tipo))
        .where(onde)
        .orderBy(asc(avisosCadastro.primeiraVezEm), asc(avisosCadastro.id))
        .limit(limite),
      this.db
        .select({ total: count() })
        .from(avisosCadastro)
        .innerJoin(tiposAviso, eq(tiposAviso.tipo, avisosCadastro.tipo))
        .where(onde),
    ]);
    return { total: total?.total ?? 0, itens };
  }
}
