import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import { DATABASE, type Database } from '../../../database/database';
import {
  categoriasExame,
  clientes,
  competencias,
  demonstrativosFaturamento as dem,
  especialidades,
  demonstrativosFaturamentoItens as itens,
  modalidades,
  prioridades,
} from '../../../database/schema';
import type {
  DemonstrativoDetalhado,
  DemonstrativosRepository,
  GravacaoDemonstrativos,
  ResumoDemonstrativo,
  TotaisCompetencia,
} from '../../application/ports/demonstrativos.repository';

const LOTE = 1000;
const membro = alias(clientes, 'membro');

const resumo = {
  id: dem.id,
  competencia: dem.competencia,
  clienteId: dem.clienteId,
  cliente: clientes.nome,
  versao: dem.versao,
  vigente: dem.vigente,
  origem: dem.origem,
  recalculoId: dem.recalculoId,
  laudos: dem.laudos,
  quantidade: dem.quantidade,
  valorCentavos: dem.valorCentavos,
  quantidadeSemPreco: dem.quantidadeSemPreco,
  nadaAFaturar: dem.nadaAFaturar,
  geradoEm: dem.geradoEm,
};

@Injectable()
export class DrizzleDemonstrativosRepository implements DemonstrativosRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  gravar(g: GravacaoDemonstrativos): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // Trava a competência: fechar no meio da prévia espera, e a prévia vê o status final.
      const [c] = await tx
        .select({ status: competencias.status })
        .from(competencias)
        .where(eq(competencias.competencia, g.competencia))
        .for('update');
      const esperado = g.origem === 'previa' ? 'aberta' : 'fechada';
      if (c?.status !== esperado) return false;

      await tx.delete(dem).where(and(eq(dem.competencia, g.competencia), eq(dem.origem, 'previa')));
      await tx
        .update(dem)
        .set({ vigente: false })
        .where(and(eq(dem.competencia, g.competencia), eq(dem.vigente, true)));
      const ultimas = await tx
        .select({
          clienteId: dem.clienteId,
          versao: sql<number>`max(${dem.versao})`.mapWith(Number),
        })
        .from(dem)
        .where(eq(dem.competencia, g.competencia))
        .groupBy(dem.clienteId);
      const ultima = new Map(ultimas.map((u) => [u.clienteId, u.versao]));

      for (let i = 0; i < g.demonstrativos.length; i += LOTE) {
        const lote = g.demonstrativos.slice(i, i + LOTE);
        const cabecalhos = await tx
          .insert(dem)
          .values(
            lote.map((d) => ({
              competencia: g.competencia,
              clienteId: d.clienteId,
              versao: (ultima.get(d.clienteId) ?? 0) + 1,
              vigente: true,
              origem: g.origem,
              recalculoId: g.recalculoId,
              contratadoId: d.contratadoId,
              laudos: d.laudos,
              quantidade: d.quantidade,
              valorCentavos: d.valorCentavos,
              quantidadeSemPreco: d.quantidadeSemPreco,
              nadaAFaturar: d.nadaAFaturar,
              geradoEm: g.geradoEm,
            })),
          )
          .returning({ id: dem.id, clienteId: dem.clienteId });
        const idDe = new Map(cabecalhos.map((h) => [h.clienteId, h.id]));
        const linhas = lote.flatMap((d) =>
          d.itens.map((it) => ({
            demonstrativoId: idDe.get(d.clienteId) as string,
            membroId: it.membroId,
            modalidadeId: it.modalidadeId,
            especialidadeId: it.especialidadeId,
            categoriaId: it.categoriaId,
            prioridadeId: it.prioridadeId,
            dia: it.dia,
            unitarioCentavos: it.unitarioCentavos,
            linhaPrecoId: it.linhaPrecoId,
            origemPreco: it.origem,
            comoAchou: it.como,
            quantidade: it.quantidade,
            valorCentavos: it.valorCentavos,
            laudos: it.laudos,
          })),
        );
        for (let j = 0; j < linhas.length; j += LOTE) {
          await tx.insert(itens).values(linhas.slice(j, j + LOTE));
        }
      }
      return true;
    });
  }

  async listar(
    competencia: string,
    { pagina, porPagina }: Paginacao,
  ): Promise<Pagina<ResumoDemonstrativo>> {
    const onde = and(eq(dem.competencia, competencia), eq(dem.vigente, true));
    const [linhas, [total]] = await Promise.all([
      this.db
        .select(resumo)
        .from(dem)
        .innerJoin(clientes, eq(clientes.id, dem.clienteId))
        .where(onde)
        .orderBy(asc(clientes.nome))
        .limit(porPagina)
        .offset((pagina - 1) * porPagina),
      this.db.select({ total: count() }).from(dem).where(onde),
    ]);
    return { itens: linhas, total: total?.total ?? 0 };
  }

  async totais(competencia: string): Promise<TotaisCompetencia> {
    const [t] = await this.db
      .select({
        clientes: count(),
        laudos: sql<number>`coalesce(sum(${dem.laudos}), 0)`.mapWith(Number),
        quantidade: sql<number>`coalesce(sum(${dem.quantidade}), 0)`.mapWith(Number),
        valorCentavos: sql<number>`coalesce(sum(${dem.valorCentavos}), 0)`.mapWith(Number),
        quantidadeSemPreco: sql<number>`coalesce(sum(${dem.quantidadeSemPreco}), 0)`.mapWith(
          Number,
        ),
      })
      .from(dem)
      .where(and(eq(dem.competencia, competencia), eq(dem.vigente, true)));
    return t ?? { clientes: 0, laudos: 0, quantidade: 0, valorCentavos: 0, quantidadeSemPreco: 0 };
  }

  async obter(
    competencia: string,
    clienteId: string,
    versao?: number,
  ): Promise<DemonstrativoDetalhado | null> {
    const [cabecalho] = await this.db
      .select(resumo)
      .from(dem)
      .innerJoin(clientes, eq(clientes.id, dem.clienteId))
      .where(
        and(
          eq(dem.competencia, competencia),
          eq(dem.clienteId, clienteId),
          versao === undefined ? eq(dem.vigente, true) : eq(dem.versao, versao),
        ),
      );
    if (!cabecalho) return null;
    const linhas = await this.db
      .select({
        membroId: itens.membroId,
        modalidadeId: itens.modalidadeId,
        especialidadeId: itens.especialidadeId,
        categoriaId: itens.categoriaId,
        prioridadeId: itens.prioridadeId,
        dia: itens.dia,
        unitarioCentavos: itens.unitarioCentavos,
        linhaPrecoId: itens.linhaPrecoId,
        origem: itens.origemPreco,
        como: itens.comoAchou,
        quantidade: itens.quantidade,
        valorCentavos: itens.valorCentavos,
        laudos: itens.laudos,
        membro: membro.nome,
        modalidade: modalidades.codigo,
        especialidade: especialidades.nome,
        categoria: categoriasExame.nome,
        prioridade: prioridades.nome,
      })
      .from(itens)
      .innerJoin(membro, eq(membro.id, itens.membroId))
      .innerJoin(modalidades, eq(modalidades.id, itens.modalidadeId))
      .innerJoin(especialidades, eq(especialidades.id, itens.especialidadeId))
      .innerJoin(categoriasExame, eq(categoriasExame.id, itens.categoriaId))
      .innerJoin(prioridades, eq(prioridades.id, itens.prioridadeId))
      .where(eq(itens.demonstrativoId, cabecalho.id))
      .orderBy(asc(membro.nome), asc(modalidades.codigo), asc(especialidades.nome), asc(itens.dia));
    return {
      ...cabecalho,
      itens: linhas.map(
        ({ membro: m, modalidade, especialidade, categoria, prioridade, ...i }) => ({
          ...i,
          nomes: { membro: m, modalidade, especialidade, categoria, prioridade },
        }),
      ),
    };
  }

  versoes(competencia: string, clienteId: string): Promise<ResumoDemonstrativo[]> {
    return this.db
      .select(resumo)
      .from(dem)
      .innerJoin(clientes, eq(clientes.id, dem.clienteId))
      .where(and(eq(dem.competencia, competencia), eq(dem.clienteId, clienteId)))
      .orderBy(desc(dem.versao));
  }
}
