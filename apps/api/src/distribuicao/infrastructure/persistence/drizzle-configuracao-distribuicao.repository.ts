import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  configuracaoDistribuicao,
  configuracaoDistribuicaoListaPrioridades,
  configuracaoDistribuicaoTurnosPosteriores,
  configuracaoDistribuicaoUrgentes,
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
    const [urgentes, lista, posteriores] = await Promise.all([
      this.db.select().from(configuracaoDistribuicaoUrgentes),
      this.db.select().from(configuracaoDistribuicaoListaPrioridades),
      this.db.select().from(configuracaoDistribuicaoTurnosPosteriores),
    ]);
    const {
      id: _,
      atualizadoEm: __,
      turnosPosterioresCheiaEm,
      listaPrazoMinimoHoras,
      ...resto
    } = linha;
    return {
      ...resto,
      prioridadeIdsUrgentes: urgentes.map((u) => u.prioridadeId).sort(),
      turnosPosteriores:
        turnosPosterioresCheiaEm === null
          ? null
          : {
              turnoIds: posteriores.map((t) => t.turnoId).sort(),
              cheiaEm: turnosPosterioresCheiaEm,
            },
      lista: {
        prioridadeIds: lista.map((p) => p.prioridadeId).sort(),
        prazoMinimoHoras: listaPrazoMinimoHoras,
      },
    };
  }

  async salvar(c: ConfiguracaoGlobal): Promise<void> {
    const { prioridadeIdsUrgentes, turnosPosteriores, lista, ...escalares } = c;
    const linha = {
      ...escalares,
      turnosPosterioresCheiaEm: turnosPosteriores?.cheiaEm ?? null,
      listaPrazoMinimoHoras: lista.prazoMinimoHoras,
    };
    await this.db.transaction(async (tx) => {
      await tx
        .insert(configuracaoDistribuicao)
        .values({ id: ID, ...linha })
        .onConflictDoUpdate({ target: configuracaoDistribuicao.id, set: linha });
      await tx.delete(configuracaoDistribuicaoUrgentes);
      await tx.delete(configuracaoDistribuicaoListaPrioridades);
      await tx.delete(configuracaoDistribuicaoTurnosPosteriores);
      if (prioridadeIdsUrgentes.length)
        await tx
          .insert(configuracaoDistribuicaoUrgentes)
          .values(prioridadeIdsUrgentes.map((prioridadeId) => ({ prioridadeId })));
      if (lista.prioridadeIds.length)
        await tx
          .insert(configuracaoDistribuicaoListaPrioridades)
          .values(lista.prioridadeIds.map((prioridadeId) => ({ prioridadeId })));
      if (turnosPosteriores?.turnoIds.length)
        await tx
          .insert(configuracaoDistribuicaoTurnosPosteriores)
          .values(turnosPosteriores.turnoIds.map((turnoId) => ({ turnoId })));
    });
  }
}
