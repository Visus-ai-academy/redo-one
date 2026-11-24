import { Inject, Injectable } from '@nestjs/common';
import { asc, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { cortesCompetencia } from '../../../database/schema';
import type { LeitorCortesCompetencia } from '../../../ingestao/application/ports/cortes-competencia';
import {
  CORTE_PADRAO_INICIAL,
  type Corte,
  type TabelaCortes,
  type VigenciaCliente,
  type VigenciaCorte,
} from '../../../ingestao/domain/competencia';
import type { CortesRepository } from '../../application/ports/cortes.repository';

type Linha = typeof cortesCompetencia.$inferSelect;

/** Corte da linha; nulo com "usa o padrão" (as restrições da tabela garantem o resto). */
const corteDa = (l: Linha): Corte | null =>
  l.usaPadrao
    ? null
    : {
        dia: l.ultimoDia ? 'ultimo' : (l.dia ?? 0),
        mes: l.mes ?? 'seguinte',
        consideraExame: l.consideraExame ?? true,
      };

/** Também é a porta `LeitorCortesCompetencia` da `ingestao`. */
@Injectable()
export class DrizzleCortesRepository implements CortesRepository, LeitorCortesCompetencia {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async carregar(): Promise<TabelaCortes> {
    const linhas = await this.db
      .select()
      .from(cortesCompetencia)
      .orderBy(asc(cortesCompetencia.desde));
    const padrao: VigenciaCorte[] = [];
    const porCliente = new Map<string, VigenciaCliente[]>();
    for (const l of linhas) {
      const corte = corteDa(l);
      if (l.clienteId === null) {
        if (corte) padrao.push({ desde: l.desde, corte });
        continue;
      }
      const cadeia = porCliente.get(l.clienteId) ?? [];
      cadeia.push({ desde: l.desde, corte });
      porCliente.set(l.clienteId, cadeia);
    }
    return { padrao: padrao.length > 0 ? padrao : [CORTE_PADRAO_INICIAL], porCliente };
  }

  async garantirPadraoInicial(): Promise<void> {
    const { desde, corte } = CORTE_PADRAO_INICIAL;
    const dia = corte.dia === 'ultimo' ? null : corte.dia;
    // Num comando só: duas subidas ao mesmo tempo não gravam duas linhas.
    await this.db.execute(sql`
      insert into ${cortesCompetencia} (desde, dia, ultimo_dia, mes, considera_exame)
      select ${desde}, ${dia}, ${corte.dia === 'ultimo'}, ${corte.mes}, ${corte.consideraExame}
      where not exists (select 1 from ${cortesCompetencia} where cliente_id is null)
      on conflict do nothing
    `);
  }
}
