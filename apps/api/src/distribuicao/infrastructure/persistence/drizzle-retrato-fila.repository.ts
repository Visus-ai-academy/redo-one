import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { adicionarJob } from '../../../comum/jobs/adicionar-job';
import { DATABASE, type Database } from '../../../database/database';
import { retratoFilaDistribuicao } from '../../../database/schema';
import type {
  RetratoFilaGravado,
  RetratoFilaRepository,
} from '../../application/ports/retrato-fila.repository';
import {
  CHAVE_RETRATO_FILA,
  FILA_RETRATO_FILA,
  TAREFA_LER_RETRATO_FILA,
} from '../../application/tarefas';
import type { FilaDoMomento } from '../../application/use-cases/rodadas/consultas';

const ID = 1;
/** Os campos de data do retrato: no jsonb viram texto ISO e voltam como Date. */
const DATAS = new Set(['lidaEm', 'primeiroVencimento', 'proximoVencimento', 'inicio', 'fim']);
const comDatas = (fila: unknown): FilaDoMomento =>
  JSON.parse(JSON.stringify(fila), (k, v) =>
    DATAS.has(k) && typeof v === 'string' ? new Date(v) : v,
  );

@Injectable()
export class DrizzleRetratoFilaRepository implements RetratoFilaRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async obter(): Promise<RetratoFilaGravado> {
    const [linha] = await this.db
      .select()
      .from(retratoFilaDistribuicao)
      .where(eq(retratoFilaDistribuicao.id, ID));
    return {
      fila: linha?.fila ? comDatas(linha.fila) : null,
      pedidaEm: linha?.pedidaEm ?? null,
      falhouEm: linha?.falhouEm ?? null,
      erro: linha?.erro ?? null,
    };
  }

  gravar(fila: FilaDoMomento): Promise<void> {
    return this.upsert(this.db, { fila, lidaEm: fila.lidaEm, falhouEm: null, erro: null });
  }

  registrarFalha(em: Date, erro: string): Promise<void> {
    return this.upsert(this.db, { falhouEm: em, erro });
  }

  async pedirLeitura(em: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.upsert(tx, { pedidaEm: em });
      await adicionarJob(
        tx,
        TAREFA_LER_RETRATO_FILA,
        {},
        // Falhou, o próximo agendamento (ou "Ler agora") tenta de novo.
        { fila: FILA_RETRATO_FILA, chave: CHAVE_RETRATO_FILA, maxTentativas: 1 },
      );
    });
  }

  private async upsert(
    db: Pick<Database, 'insert'>,
    valores: Partial<typeof retratoFilaDistribuicao.$inferInsert>,
  ): Promise<void> {
    await db
      .insert(retratoFilaDistribuicao)
      .values({ id: ID, ...valores })
      .onConflictDoUpdate({ target: retratoFilaDistribuicao.id, set: valores });
  }
}
