import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { DATABASE, type Database } from '../../../database/database';
import {
  ajustesLaudoFaturamento as ajustes,
  competencias,
  laudos,
  usuarios,
} from '../../../database/schema';
import type {
  AjusteLaudo,
  AjustesLaudoRepository,
  LaudoDoAjuste,
  NovoAjusteLaudo,
} from '../../application/ports/ajustes-laudo.repository';
import type { Autor } from '../../application/ports/competencias.repository';
import { enfileirarPreviasDemonstrativo } from '../jobs/enfileirar-demonstrativos';

const criou = alias(usuarios, 'criou');
const encerrou = alias(usuarios, 'encerrou');
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class DrizzleAjustesLaudoRepository implements AjustesLaudoRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async obterLaudo(id: string): Promise<LaudoDoAjuste | null> {
    const [l] = await this.db
      .select({
        id: laudos.id,
        identidade: laudos.identidade,
        competencia: laudos.competencia,
        clienteId: laudos.clienteId,
      })
      .from(laudos)
      .where(eq(laudos.id, id));
    return l ?? null;
  }

  private consulta() {
    return this.db
      .select({
        id: ajustes.id,
        laudoIdentidade: ajustes.laudoIdentidade,
        laudoId: laudos.id,
        competencia: ajustes.competencia,
        clienteId: ajustes.clienteId,
        tipo: ajustes.tipo,
        valorUnitarioCentavos: ajustes.valorUnitarioCentavos,
        motivo: ajustes.motivo,
        criadoEm: ajustes.criadoEm,
        criadoPorId: ajustes.criadoPorId,
        criadoPor: criou.nome,
        encerradoEm: ajustes.encerradoEm,
        encerradoPorId: ajustes.encerradoPorId,
        encerradoPor: encerrou.nome,
        motivoEncerramento: ajustes.motivoEncerramento,
      })
      .from(ajustes)
      .leftJoin(laudos, eq(laudos.identidade, ajustes.laudoIdentidade))
      .leftJoin(criou, eq(criou.id, ajustes.criadoPorId))
      .leftJoin(encerrou, eq(encerrou.id, ajustes.encerradoPorId))
      .$dynamic();
  }

  async vigente(identidade: string): Promise<AjusteLaudo | null> {
    const [a] = await this.consulta().where(
      and(eq(ajustes.laudoIdentidade, identidade), isNull(ajustes.encerradoEm)),
    );
    return a ?? null;
  }

  async obter(id: string): Promise<AjusteLaudo | null> {
    const [a] = await this.consulta().where(eq(ajustes.id, id));
    return a ?? null;
  }

  /** A competência aberta refaz a prévia; a fechada espera o recálculo com motivo. */
  private async previasSeAberta(tx: Tx, competencia: string) {
    const [c] = await tx
      .select({ status: competencias.status })
      .from(competencias)
      .where(eq(competencias.competencia, competencia));
    if (c?.status !== 'fechada') await enfileirarPreviasDemonstrativo(tx);
  }

  criar(
    novo: NovoAjusteLaudo,
    { usuarioId, em }: Autor,
    motivoTroca: string | null,
  ): Promise<string> {
    return this.db.transaction(async (tx) => {
      if (motivoTroca)
        await tx
          .update(ajustes)
          .set({ encerradoEm: em, encerradoPorId: usuarioId, motivoEncerramento: motivoTroca })
          .where(
            and(eq(ajustes.laudoIdentidade, novo.laudo.identidade), isNull(ajustes.encerradoEm)),
          );
      const [linha] = await tx
        .insert(ajustes)
        .values({
          laudoIdentidade: novo.laudo.identidade,
          competencia: novo.laudo.competencia,
          clienteId: novo.laudo.clienteId,
          tipo: novo.tipo,
          valorUnitarioCentavos: novo.valorUnitarioCentavos,
          motivo: novo.motivo,
          criadoEm: em,
          criadoPorId: usuarioId,
        })
        .returning({ id: ajustes.id });
      if (!linha) throw new Error('ajuste não gravado');
      await this.previasSeAberta(tx, novo.laudo.competencia);
      return linha.id;
    });
  }

  encerrar(id: string, motivo: string, { usuarioId, em }: Autor): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [linha] = await tx
        .update(ajustes)
        .set({ encerradoEm: em, encerradoPorId: usuarioId, motivoEncerramento: motivo })
        .where(and(eq(ajustes.id, id), isNull(ajustes.encerradoEm)))
        .returning({ competencia: ajustes.competencia });
      if (linha) await this.previasSeAberta(tx, linha.competencia);
      return Boolean(linha);
    });
  }

  listar(competencia: string): Promise<AjusteLaudo[]> {
    return this.consulta()
      .where(eq(ajustes.competencia, competencia))
      .orderBy(desc(ajustes.criadoEm), desc(ajustes.id));
  }
}
