import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  configuracaoDistribuicao,
  configuracaoDistribuicaoRecolhimentoTurnos,
  configuracaoDistribuicaoTurnosPosteriores,
} from '../../../database/schema';
import type { ConfiguracaoDistribuicaoRepository } from '../../application/ports/configuracao-distribuicao.repository';
import type { ConfiguracaoGlobal } from '../../domain/configuracao-global';

const ID = 1;

@Injectable()
export class DrizzleConfiguracaoDistribuicaoRepository
  implements ConfiguracaoDistribuicaoRepository
{
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async obter(): Promise<ConfiguracaoGlobal | null> {
    const [linha] = await this.db
      .select()
      .from(configuracaoDistribuicao)
      .where(eq(configuracaoDistribuicao.id, ID));
    if (!linha) return null;
    const [posteriores, prazos] = await Promise.all([
      this.db.select().from(configuracaoDistribuicaoTurnosPosteriores),
      this.db
        .select()
        .from(configuracaoDistribuicaoRecolhimentoTurnos)
        .orderBy(configuracaoDistribuicaoRecolhimentoTurnos.turnoId),
    ]);
    const { id: _, atualizadoEm: __, turnosPosterioresCheiaEm, ...resto } = linha;
    return {
      ...resto,
      recolhimentoPorTurno: prazos.map((p) => ({ turnoId: p.turnoId, minutos: p.minutos })),
      turnosPosteriores:
        turnosPosterioresCheiaEm === null
          ? null
          : {
              turnoIds: posteriores.map((t) => t.turnoId).sort(),
              cheiaEm: turnosPosterioresCheiaEm,
            },
    };
  }

  async salvar(c: ConfiguracaoGlobal): Promise<void> {
    const { turnosPosteriores, recolhimentoPorTurno, ...escalares } = c;
    const linha = { ...escalares, turnosPosterioresCheiaEm: turnosPosteriores?.cheiaEm ?? null };
    await this.db.transaction(async (tx) => {
      await tx
        .insert(configuracaoDistribuicao)
        .values({ id: ID, ...linha })
        .onConflictDoUpdate({ target: configuracaoDistribuicao.id, set: linha });
      await tx.delete(configuracaoDistribuicaoTurnosPosteriores);
      if (turnosPosteriores?.turnoIds.length)
        await tx
          .insert(configuracaoDistribuicaoTurnosPosteriores)
          .values(turnosPosteriores.turnoIds.map((turnoId) => ({ turnoId })));
      await tx.delete(configuracaoDistribuicaoRecolhimentoTurnos);
      if (recolhimentoPorTurno.length)
        await tx.insert(configuracaoDistribuicaoRecolhimentoTurnos).values(recolhimentoPorTurno);
    });
  }
}
