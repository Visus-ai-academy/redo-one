import { Inject, Injectable } from '@nestjs/common';
import {
  type AnyColumn,
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import { DATABASE, type Database } from '../../../database/database';
import { competencias, laudos, usuarios } from '../../../database/schema';
import { enfileirarRecalculoCompetencias } from '../../../ingestao/infrastructure/jobs/enfileirar-recalculo-competencias';
import { enfileirarReclassificacaoTipificacao } from '../../../ingestao/infrastructure/jobs/enfileirar-reclassificacao-tipificacao';
import type {
  Autor,
  CompetenciaResumo,
  CompetenciasRepository,
  SituacaoCompetencia,
} from '../../application/ports/competencias.repository';

const fechou = alias(usuarios, 'fechou');
const reabriu = alias(usuarios, 'reabriu');
const travou = alias(usuarios, 'travou');

/** Nome do usuário ou, sem usuário, o texto do dashboards-one. */
const autor = (nome: AnyColumn, legado: AnyColumn) =>
  sql<string | null>`coalesce(${nome}, ${legado})`;

/** Também é a porta `CompetenciasBloqueadas` da `ingestao`. */
@Injectable()
export class DrizzleCompetenciasRepository implements CompetenciasRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(): Promise<string[]> {
    const linhas = await this.db
      .select({ competencia: competencias.competencia })
      .from(competencias)
      .where(or(eq(competencias.status, 'fechada'), isNotNull(competencias.importacaoTravadaEm)));
    return linhas.map((l) => l.competencia);
  }

  async garantir(lista: string[]): Promise<void> {
    const unicas = [...new Set(lista)];
    if (unicas.length === 0) return;
    await this.db
      .insert(competencias)
      .values(unicas.map((competencia) => ({ competencia, status: 'aberta' as const })))
      .onConflictDoNothing({ target: competencias.competencia });
  }

  async listarPagina({ pagina, porPagina }: Paginacao): Promise<Pagina<CompetenciaResumo>> {
    const [linhas, [total]] = await Promise.all([
      this.db
        .select({
          competencia: competencias.competencia,
          status: competencias.status,
          fechadaEm: competencias.fechadaEm,
          fechadaPor: autor(fechou.nome, competencias.fechadaPorLegado),
          reabertaEm: competencias.reabertaEm,
          reabertaPor: autor(reabriu.nome, competencias.reabertaPorLegado),
          importacaoTravadaEm: competencias.importacaoTravadaEm,
          importacaoTravadaPor: autor(travou.nome, competencias.importacaoTravadaPorLegado),
          observacoes: competencias.observacoes,
        })
        .from(competencias)
        .leftJoin(fechou, eq(fechou.id, competencias.fechadaPorId))
        .leftJoin(reabriu, eq(reabriu.id, competencias.reabertaPorId))
        .leftJoin(travou, eq(travou.id, competencias.importacaoTravadaPorId))
        .orderBy(desc(competencias.competencia))
        .limit(porPagina)
        .offset((pagina - 1) * porPagina),
      this.db.select({ total: count() }).from(competencias),
    ]);
    const totais = await this.totaisDosLaudos(linhas.map((l) => l.competencia));
    return {
      itens: linhas.map((l) => ({
        ...l,
        ...(totais.get(l.competencia) ?? { laudos: 0, volume: 0 }),
      })),
      total: total?.total ?? 0,
    };
  }

  /** Laudos (não removidos) e volume somados, só das competências pedidas (pelo índice). */
  private async totaisDosLaudos(lista: string[]) {
    if (lista.length === 0) return new Map<string, { laudos: number; volume: number }>();
    const linhas = await this.db
      .select({
        competencia: laudos.competencia,
        laudos: count(),
        volume: sql<string>`coalesce(sum(${laudos.volume}), 0)`,
      })
      .from(laudos)
      .where(and(inArray(laudos.competencia, lista), isNull(laudos.removidoEm)))
      .groupBy(laudos.competencia);
    return new Map(
      linhas.map((l) => [l.competencia, { laudos: l.laudos, volume: Number(l.volume) }]),
    );
  }

  async obter(competencia: string): Promise<SituacaoCompetencia | null> {
    const [linha] = await this.db
      .select({
        status: competencias.status,
        importacaoTravada: isNotNull(competencias.importacaoTravadaEm).mapWith(Boolean),
      })
      .from(competencias)
      .where(eq(competencias.competencia, competencia));
    return linha ?? null;
  }

  async ultimaFechada(): Promise<string | null> {
    const [linha] = await this.db
      .select({ competencia: competencias.competencia })
      .from(competencias)
      .where(eq(competencias.status, 'fechada'))
      .orderBy(desc(competencias.competencia))
      .limit(1);
    return linha?.competencia ?? null;
  }

  /** Atualiza só se a condição ainda vale (outra requisição pode ter mudado antes). */
  private async atualizar(
    competencia: string,
    condicao: SQL | undefined,
    valores: Partial<typeof competencias.$inferInsert>,
    db: Pick<Database, 'update'> = this.db,
  ): Promise<boolean> {
    const linhas = await db
      .update(competencias)
      .set(valores)
      .where(and(eq(competencias.competencia, competencia), condicao))
      .returning({ competencia: competencias.competencia });
    return linhas.length > 0;
  }

  fechar(competencia: string, { usuarioId, em }: Autor): Promise<boolean> {
    return this.atualizar(competencia, eq(competencias.status, 'aberta'), {
      status: 'fechada',
      fechadaEm: em,
      fechadaPorId: usuarioId,
      fechadaPorLegado: null,
    });
  }

  /**
   * Com a reclassificação da tipificação na mesma transação: a configuração mudada enquanto a
   * competência estava fechada chega aos laudos dela.
   */
  reabrir(competencia: string, { usuarioId, em }: Autor): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const reabriu = await this.atualizar(
        competencia,
        eq(competencias.status, 'fechada'),
        { status: 'aberta', reabertaEm: em, reabertaPorId: usuarioId, reabertaPorLegado: null },
        tx,
      );
      if (reabriu) await enfileirarReclassificacaoTipificacao(tx, null);
      return reabriu;
    });
  }

  travarImportacao(competencia: string, { usuarioId, em }: Autor): Promise<boolean> {
    return this.atualizar(competencia, isNull(competencias.importacaoTravadaEm), {
      importacaoTravadaEm: em,
      importacaoTravadaPorId: usuarioId,
      importacaoTravadaPorLegado: null,
    });
  }

  /**
   * Com o recálculo e a reclassificação de todos os laudos na mesma transação: os que a importação
   * e os jobs pularam enquanto estava travada ganham o corte e a tipificação atuais.
   */
  destravarImportacao(competencia: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const destravou = await this.atualizar(
        competencia,
        isNotNull(competencias.importacaoTravadaEm),
        {
          importacaoTravadaEm: null,
          importacaoTravadaPorId: null,
          importacaoTravadaPorLegado: null,
        },
        tx,
      );
      if (destravou) {
        await enfileirarRecalculoCompetencias(tx, null);
        await enfileirarReclassificacaoTipificacao(tx, null);
      }
      return destravou;
    });
  }
}
