import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  ajustesDiaDistribuicao,
  ajustesDiaDistribuicaoPrioridades,
  alocacoes,
  clientes,
} from '../../../database/schema';
import type {
  AjusteDiaLido,
  AjustesDiaRepository,
  FiltroAjustesDia,
} from '../../application/ports/ajustes-dia.repository';
import type { AjusteDiaDistribuicao } from '../../domain/ajuste-dia';

const a = ajustesDiaDistribuicao;

@Injectable()
export class DrizzleAjustesDiaRepository implements AjustesDiaRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private async ler(onde: SQL | undefined): Promise<AjusteDiaLido[]> {
    const linhas = await this.db
      .select({
        id: a.id,
        alocacaoId: a.alocacaoId,
        data: a.data,
        segueSla: a.segueSla,
        clienteId: a.clienteId,
        laudosExtra: a.laudosExtra,
        clienteNome: clientes.nome,
        medicoId: alocacoes.medicoId,
        turnoId: alocacoes.turnoId,
        frenteId: alocacoes.frenteId,
      })
      .from(a)
      .innerJoin(alocacoes, eq(alocacoes.id, a.alocacaoId))
      .leftJoin(clientes, eq(clientes.id, a.clienteId))
      .where(onde)
      .orderBy(asc(a.data), asc(a.criadoEm));
    if (!linhas.length) return [];
    const prios = await this.db
      .select()
      .from(ajustesDiaDistribuicaoPrioridades)
      .where(
        inArray(
          ajustesDiaDistribuicaoPrioridades.ajusteId,
          linhas.map((l) => l.id),
        ),
      );
    return linhas.map((l) => ({
      ...l,
      prioridadeIdsLiberadas: prios
        .filter((p) => p.ajusteId === l.id)
        .map((p) => p.prioridadeId)
        .sort(),
    }));
  }

  async obter(alocacaoId: string, data: string): Promise<AjusteDiaLido | null> {
    const [lido] = await this.ler(and(eq(a.alocacaoId, alocacaoId), eq(a.data, data)));
    return lido ?? null;
  }

  async salvar(ajuste: AjusteDiaDistribuicao): Promise<void> {
    const { prioridadeIdsLiberadas, ...linha } = ajuste;
    await this.db.transaction(async (tx) => {
      await tx
        .insert(a)
        .values(linha)
        .onConflictDoUpdate({
          target: [a.alocacaoId, a.data],
          set: {
            segueSla: linha.segueSla,
            clienteId: linha.clienteId,
            laudosExtra: linha.laudosExtra,
          },
        });
      const [gravado] = await tx
        .select({ id: a.id })
        .from(a)
        .where(and(eq(a.alocacaoId, linha.alocacaoId), eq(a.data, linha.data)));
      const ajusteId = gravado?.id ?? linha.id;
      await tx
        .delete(ajustesDiaDistribuicaoPrioridades)
        .where(eq(ajustesDiaDistribuicaoPrioridades.ajusteId, ajusteId));
      if (prioridadeIdsLiberadas.length)
        await tx
          .insert(ajustesDiaDistribuicaoPrioridades)
          .values(prioridadeIdsLiberadas.map((prioridadeId) => ({ ajusteId, prioridadeId })));
    });
  }

  async remover(id: string): Promise<void> {
    await this.db.delete(a).where(eq(a.id, id));
  }

  listar(f: FiltroAjustesDia): Promise<AjusteDiaLido[]> {
    return this.ler(
      and(
        gte(a.data, f.de),
        lte(a.data, f.ate),
        f.medicoId ? eq(alocacoes.medicoId, f.medicoId) : undefined,
      ),
    );
  }
}
