import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, or } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  reclassificacoesFaturamentoRecortes as recortes,
  reclassificacoesFaturamento as regras,
} from '../../../database/schema';
import type { Autor } from '../../application/ports/competencias.repository';
import type {
  NovaReclassificacao,
  ReclassificacoesRepository,
} from '../../application/ports/reclassificacoes.repository';
import type { ReclassificacaoFaturamento } from '../../domain/reclassificacao';
import { enfileirarPreviasDemonstrativo } from '../jobs/enfileirar-demonstrativos';

type Executor = Pick<Database, 'select'>;

/** As reclassificações com os recortes (nulo = "todos"), lidas também pela montagem. */
export async function lerReclassificacoes(db: Executor): Promise<ReclassificacaoFaturamento[]> {
  const [linhas, cortes] = await Promise.all([
    db.select().from(regras),
    db.select().from(recortes),
  ]);
  const de = (id: string, k: 'modalidadeId' | 'especialidadeId' | 'categoriaId' | 'equipeId') =>
    cortes.filter((c) => c.reclassificacaoId === id && c[k]).map((c) => c[k] as string);
  return linhas.map((r) => ({
    id: r.id,
    ordem: r.ordem,
    descricao: r.descricao,
    modalidadeIds: r.todasModalidades ? null : de(r.id, 'modalidadeId'),
    especialidadeIds: r.todasEspecialidades ? null : de(r.id, 'especialidadeId'),
    categoriaIds: r.todasCategorias ? null : de(r.id, 'categoriaId'),
    equipeIds: r.todosMedicos ? null : de(r.id, 'equipeId'),
    especialidadeDestinoId: r.especialidadeDestinoId,
    categoriaDestinoId: r.categoriaDestinoId,
    vigenciaDesde: r.vigenciaDesde,
    vigenciaAte: r.vigenciaAte,
  }));
}

@Injectable()
export class DrizzleReclassificacoesRepository implements ReclassificacoesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  listar(): Promise<ReclassificacaoFaturamento[]> {
    return lerReclassificacoes(this.db);
  }

  criar(r: NovaReclassificacao, { usuarioId, em }: Autor): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [linha] = await tx
        .insert(regras)
        .values({
          ordem: r.ordem,
          descricao: r.descricao,
          todasModalidades: r.modalidadeIds === null,
          todasEspecialidades: r.especialidadeIds === null,
          todasCategorias: r.categoriaIds === null,
          todosMedicos: r.equipeIds === null,
          especialidadeDestinoId: r.especialidadeDestinoId,
          categoriaDestinoId: r.categoriaDestinoId,
          vigenciaDesde: r.vigenciaDesde,
          criadoEm: em,
          criadoPorId: usuarioId,
        })
        .returning({ id: regras.id });
      if (!linha) throw new Error('reclassificação não gravada');
      const id = linha.id;
      const lista = [
        ...(r.modalidadeIds ?? []).map((modalidadeId) => ({ reclassificacaoId: id, modalidadeId })),
        ...(r.especialidadeIds ?? []).map((especialidadeId) => ({
          reclassificacaoId: id,
          especialidadeId,
        })),
        ...(r.categoriaIds ?? []).map((categoriaId) => ({ reclassificacaoId: id, categoriaId })),
        ...(r.equipeIds ?? []).map((equipeId) => ({ reclassificacaoId: id, equipeId })),
      ];
      if (lista.length) await tx.insert(recortes).values(lista);
      await enfileirarPreviasDemonstrativo(tx);
      return id;
    });
  }

  encerrar(id: string, ate: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const linhas = await tx
        .update(regras)
        .set({ vigenciaAte: ate })
        .where(and(eq(regras.id, id), or(isNull(regras.vigenciaAte), gt(regras.vigenciaAte, ate))))
        .returning({ id: regras.id });
      if (linhas.length) await enfileirarPreviasDemonstrativo(tx);
      return linhas.length > 0;
    });
  }
}
