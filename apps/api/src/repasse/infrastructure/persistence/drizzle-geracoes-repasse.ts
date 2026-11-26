import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  competencias,
  demonstrativosRepasse,
  demonstrativosRepasseDias,
  demonstrativosRepasseItens,
  demonstrativosRepasseLaudos,
  geracoesRepasse,
} from '../../../database/schema';
import type {
  GeracoesRepasse,
  NovaGeracao,
  SituacaoCompetencia,
} from '../../application/ports/geracoes-repasse';

const LOTE = 2000;
const emLotes = <T>(linhas: T[]) =>
  Array.from({ length: Math.ceil(linhas.length / LOTE) }, (_, i) =>
    linhas.slice(i * LOTE, (i + 1) * LOTE),
  );

/** Executor da transação (o `tx` do Drizzle). */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Depois de gravar a geração (na mesma transação): ex.: os avisos de laudo sem preço. */
export type AoGravarGeracao = (tx: Tx, geracao: NovaGeracao) => Promise<void>;
export const AO_GRAVAR_GERACAO = Symbol('AO_GRAVAR_GERACAO');

@Injectable()
export class DrizzleGeracoesRepasse implements GeracoesRepasse {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AO_GRAVAR_GERACAO) private readonly aoGravar: AoGravarGeracao,
  ) {}

  async situacao(competencia: string): Promise<SituacaoCompetencia> {
    const [c] = await this.db
      .select({ status: competencias.status, reabertaEm: competencias.reabertaEm })
      .from(competencias)
      .where(eq(competencias.competencia, competencia));
    return { status: c?.status ?? 'aberta', reabertaEm: c?.reabertaEm ?? null };
  }

  private async comStatus(status: 'aberta' | 'fechada') {
    const linhas = await this.db
      .select({ competencia: competencias.competencia })
      .from(competencias)
      .where(eq(competencias.status, status))
      .orderBy(asc(competencias.competencia));
    return linhas.map((l) => l.competencia);
  }

  abertas(): Promise<string[]> {
    return this.comStatus('aberta');
  }

  fechadas(): Promise<string[]> {
    return this.comStatus('fechada');
  }

  async gravar(g: NovaGeracao): Promise<string> {
    return this.db.transaction(async (tx) => {
      // Uma geração por vez por competência (o job e o recálculo podem coincidir).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`repasse:${g.competencia}`}))`);
      if (g.tipo === 'previa') {
        // A prévia anterior do mesmo período aberto sai; a de antes da reabertura (o resultado de
        // quando estava fechada) e os recálculos ficam como versão.
        await tx
          .delete(geracoesRepasse)
          .where(
            and(
              eq(geracoesRepasse.competencia, g.competencia),
              eq(geracoesRepasse.tipo, 'previa'),
              g.reabertaEm ? gt(geracoesRepasse.geradoEm, g.reabertaEm) : undefined,
            ),
          );
      }
      await tx
        .update(geracoesRepasse)
        .set({ atual: false })
        .where(
          and(eq(geracoesRepasse.competencia, g.competencia), eq(geracoesRepasse.atual, true)),
        );
      const [geracao] = await tx
        .insert(geracoesRepasse)
        .values({
          competencia: g.competencia,
          tipo: g.tipo,
          atual: true,
          recalculoId: g.recalculoId,
          geradoEm: g.geradoEm,
          geradoPorId: g.geradoPorId,
          medicos: g.demonstrativos.length,
          brutoCentavos: g.demonstrativos.reduce((s, d) => s + d.brutoCentavos, 0),
          liquidoCentavos: g.demonstrativos.reduce((s, d) => s + d.liquidoCentavos, 0),
        })
        .returning({ id: geracoesRepasse.id });
      const geracaoId = (geracao as { id: string }).id;

      const demos = !g.demonstrativos.length
        ? []
        : await tx
            .insert(demonstrativosRepasse)
            .values(
              g.demonstrativos.map((d) => ({
                geracaoId,
                competencia: g.competencia,
                medicoId: d.medicoId,
                contratadoId: d.contratadoId,
                volume: d.volume,
                examesCentavos: d.examesCentavos,
                adicionaisCentavos: d.adicionaisCentavos,
                brutoCentavos: d.brutoCentavos,
                retencoesCentavos: d.retencoesCentavos,
                liquidoCentavos: d.liquidoCentavos,
                gruposSemPreco: d.gruposSemPreco,
              })),
            )
            .returning({ id: demonstrativosRepasse.id, medicoId: demonstrativosRepasse.medicoId });
      const idDo = new Map(demos.map((d) => [d.medicoId, d.id]));

      type Item = typeof demonstrativosRepasseItens.$inferInsert & { id: string };
      const itens: Item[] = [];
      const laudosPagos: (typeof demonstrativosRepasseLaudos.$inferInsert)[] = [];
      const dias: (typeof demonstrativosRepasseDias.$inferInsert)[] = [];
      for (const d of g.demonstrativos) {
        const demonstrativoId = idDo.get(d.medicoId) as string;
        for (const gr of d.grupos) {
          const id = crypto.randomUUID();
          itens.push({
            id,
            demonstrativoId,
            tipo: 'exames',
            modalidadeId: gr.modalidadeId,
            especialidadeId: gr.especialidadeId,
            categoriaId: gr.categoriaId,
            prioridadeId: gr.prioridadeId,
            clienteId: gr.clienteId,
            unidadeId: gr.unidadeId,
            volume: gr.volume,
            unitarioCentavos: gr.unitarioCentavos,
            totalCentavos: gr.totalCentavos,
            origemPreco: gr.origem,
            categoriaPrecoId: gr.categoriaPrecoId,
            precoId: gr.precoId,
          });
          for (const l of gr.laudos)
            laudosPagos.push({
              demonstrativoId,
              itemId: id,
              laudoId: l.laudoId,
              peca: l.peca,
              volume: l.volume,
              totalCentavos: l.totalCentavos,
            });
        }
        for (const a of d.adicionais)
          itens.push({
            id: crypto.randomUUID(),
            demonstrativoId,
            tipo: 'adicional',
            totalCentavos: a.valorCentavos,
            adicionalId: a.id,
            descricao: a.descricao,
          });
        for (const x of d.extras)
          itens.push({
            id: crypto.randomUUID(),
            demonstrativoId,
            tipo: 'regra',
            totalCentavos: x.valorCentavos,
            regraId: x.regraId,
            descricao: x.descricao,
          });
        for (const r of d.retencoes)
          itens.push({
            id: crypto.randomUUID(),
            demonstrativoId,
            tipo: 'retencao',
            totalCentavos: -r.totalCentavos,
            retencaoId: r.retencaoId,
            descricao: r.descricao,
          });
        for (const dia of d.dias) dias.push({ demonstrativoId, ...dia });
      }
      for (const lote of emLotes(itens)) await tx.insert(demonstrativosRepasseItens).values(lote);
      for (const lote of emLotes(laudosPagos))
        await tx.insert(demonstrativosRepasseLaudos).values(lote);
      for (const lote of emLotes(dias)) await tx.insert(demonstrativosRepasseDias).values(lote);
      await this.aoGravar(tx, g);
      return geracaoId;
    });
  }
}
