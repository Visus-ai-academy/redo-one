import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';
import type { EventoAuditoria } from '../../../auditoria/auditoria';
import { DATABASE, type Database } from '../../../database/database';
import {
  ajustesDiaDistribuicao,
  ajustesDiaDistribuicaoPrioridades,
  alocacoes,
  clientes,
} from '../../../database/schema';
import {
  gravarEventos,
  type Transacao,
} from '../../../escala/alocacoes/drizzle-alocacoes.repository';
import type {
  AjusteDiaLido,
  AjustesDiaRepository,
  FiltroAjustesDia,
  MudancaAjustesDia,
} from '../../application/ports/ajustes-dia.repository';
import type { AjusteDiaDistribuicao } from '../../domain/ajuste-dia';

const a = ajustesDiaDistribuicao;

/** Cria ou troca (pela alocação e o dia), com as prioridades inteiras. */
async function gravar(tx: Transacao, ajuste: AjusteDiaDistribuicao) {
  const { prioridadeIdsLiberadas, ...linha } = ajuste;
  await tx
    .insert(a)
    .values(linha)
    .onConflictDoUpdate({
      target: [a.alocacaoId, a.data],
      set: {
        segueSla: linha.segueSla,
        todosClientes: linha.todosClientes,
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
}

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
        todosClientes: a.todosClientes,
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

  async aplicar(mudanca: MudancaAjustesDia, eventos: EventoAuditoria[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const ajuste of mudanca.gravar) await gravar(tx, ajuste);
      if (mudanca.removerIds.length) await tx.delete(a).where(inArray(a.id, mudanca.removerIds));
      await gravarEventos(tx, eventos);
    });
  }

  listar(f: FiltroAjustesDia): Promise<AjusteDiaLido[]> {
    return this.ler(
      and(
        gte(a.data, f.de),
        lte(a.data, f.ate),
        f.medicoId ? eq(alocacoes.medicoId, f.medicoId) : undefined,
        f.alocacaoId ? eq(a.alocacaoId, f.alocacaoId) : undefined,
      ),
    );
  }
}
