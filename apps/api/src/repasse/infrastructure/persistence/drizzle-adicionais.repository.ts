import { Inject, Injectable } from '@nestjs/common';
import { aliasedTable, and, count, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { adicionaisRepasse, medicos, parametrosRepasse, usuarios } from '../../../database/schema';
import type {
  AdicionaisRepository,
  AdicionalGravado,
  FiltroAdicionais,
} from '../../application/ports/adicionais.repository';
import type { AdicionalMontado } from '../../domain/adicional';

@Injectable()
export class DrizzleAdicionaisRepository implements AdicionaisRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async medicoExiste(medicoId: string): Promise<boolean> {
    const [m] = await this.db
      .select({ id: medicos.id })
      .from(medicos)
      .where(eq(medicos.id, medicoId));
    return !!m;
  }

  async tarifas(competencia: string) {
    const [p] = await this.db
      .select({
        peerReviewCentavos: parametrosRepasse.tarifaPeerReviewCentavos,
        plantaoCentavos: parametrosRepasse.tarifaPlantaoCentavos,
      })
      .from(parametrosRepasse)
      .where(lte(parametrosRepasse.vigenciaDesde, competencia))
      .orderBy(desc(parametrosRepasse.vigenciaDesde))
      .limit(1);
    if (!p) throw new Error('Sem parâmetros do repasse vigentes.');
    return p;
  }

  async peerReviewSobreposto(medicoId: string, desde: string, ate: string) {
    const [a] = await this.db
      .select({
        competencia: adicionaisRepasse.competencia,
        referenciaDesde: adicionaisRepasse.referenciaDesde,
        referenciaAte: adicionaisRepasse.referenciaAte,
      })
      .from(adicionaisRepasse)
      .where(
        and(
          eq(adicionaisRepasse.medicoId, medicoId),
          eq(adicionaisRepasse.tipo, 'peer_review'),
          isNull(adicionaisRepasse.canceladoEm),
          lte(adicionaisRepasse.referenciaDesde, ate),
          gte(adicionaisRepasse.referenciaAte, desde),
        ),
      )
      .limit(1);
    return a
      ? {
          competencia: a.competencia,
          referenciaDesde: a.referenciaDesde as string,
          referenciaAte: a.referenciaAte as string,
        }
      : null;
  }

  async inserir(
    a: AdicionalMontado & { medicoId: string; lancadoPorId: string; lancadoEm: Date },
  ): Promise<string> {
    const [linha] = await this.db
      .insert(adicionaisRepasse)
      .values(a)
      .returning({ id: adicionaisRepasse.id });
    return (linha as { id: string }).id;
  }

  async ligarRecalculo(id: string, recalculoId: string): Promise<void> {
    await this.db
      .update(adicionaisRepasse)
      .set({ recalculoId })
      .where(eq(adicionaisRepasse.id, id));
  }

  private consulta() {
    const lancou = aliasedTable(usuarios, 'lancou');
    const cancelou = aliasedTable(usuarios, 'cancelou');
    return this.db
      .select({
        id: adicionaisRepasse.id,
        medicoId: adicionaisRepasse.medicoId,
        medico: medicos.nome,
        tipo: adicionaisRepasse.tipo,
        competencia: adicionaisRepasse.competencia,
        data: adicionaisRepasse.data,
        valorCentavos: adicionaisRepasse.valorCentavos,
        descricao: adicionaisRepasse.descricao,
        quantidade: adicionaisRepasse.quantidade,
        valorUnitarioCentavos: adicionaisRepasse.valorUnitarioCentavos,
        referenciaDesde: adicionaisRepasse.referenciaDesde,
        referenciaAte: adicionaisRepasse.referenciaAte,
        recalculoId: adicionaisRepasse.recalculoId,
        lancadoEm: adicionaisRepasse.lancadoEm,
        lancadoPor: lancou.nome,
        canceladoEm: adicionaisRepasse.canceladoEm,
        canceladoPor: cancelou.nome,
        motivoCancelamento: adicionaisRepasse.motivoCancelamento,
      })
      .from(adicionaisRepasse)
      .innerJoin(medicos, eq(medicos.id, adicionaisRepasse.medicoId))
      .leftJoin(lancou, eq(lancou.id, adicionaisRepasse.lancadoPorId))
      .leftJoin(cancelou, eq(cancelou.id, adicionaisRepasse.canceladoPorId));
  }

  async obter(id: string): Promise<AdicionalGravado | null> {
    const [a] = await this.consulta().where(eq(adicionaisRepasse.id, id));
    return a ?? null;
  }

  async cancelar(id: string, por: string, em: Date, motivo: string): Promise<void> {
    await this.db
      .update(adicionaisRepasse)
      .set({ canceladoEm: em, canceladoPorId: por, motivoCancelamento: motivo })
      .where(and(eq(adicionaisRepasse.id, id), isNull(adicionaisRepasse.canceladoEm)));
  }

  async listar(f: FiltroAdicionais) {
    const onde = and(
      eq(adicionaisRepasse.competencia, f.competencia),
      f.medicoId ? eq(adicionaisRepasse.medicoId, f.medicoId) : undefined,
      f.tipo ? eq(adicionaisRepasse.tipo, f.tipo) : undefined,
    );
    const [itens, [total]] = await Promise.all([
      this.consulta()
        .where(onde)
        .orderBy(desc(adicionaisRepasse.lancadoEm), sql`${adicionaisRepasse.id}`)
        .limit(f.porPagina)
        .offset((f.pagina - 1) * f.porPagina),
      this.db.select({ n: count() }).from(adicionaisRepasse).where(onde),
    ]);
    return { itens, total: total?.n ?? 0, pagina: f.pagina, porPagina: f.porPagina };
  }

  async listarDoMedico(medicoId: string, p: { pagina: number; porPagina: number }) {
    const doMedico = eq(adicionaisRepasse.medicoId, medicoId);
    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(adicionaisRepasse)
      .where(doMedico);
    const itens = await this.consulta()
      .where(doMedico)
      .orderBy(
        desc(adicionaisRepasse.competencia),
        desc(adicionaisRepasse.lancadoEm),
        sql`${adicionaisRepasse.id}`,
      )
      .limit(p.porPagina)
      .offset((p.pagina - 1) * p.porPagina);
    return { itens, total };
  }
}
