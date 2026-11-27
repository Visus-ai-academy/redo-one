import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  alternativasPrecoRepasse,
  categoriasExame,
  contratados,
  equipes,
  especialidades,
  eventosAuditoria,
  modalidades,
  parametrosRepasse,
  reclassificacoesRepasse,
  reclassificacoesRepasseRecortes,
  usuarios,
} from '../../../database/schema';
import type {
  AlternativaPrecoRepasse,
  Reclassificacao,
} from '../../application/ports/configuracao-repasse.repository';
import type { EventoDaVersao } from '../../application/ports/regras-medico.repository';
import type { VersoesConfiguracaoRepository } from '../../application/ports/versoes-configuracao.repository';
import { type MudancaVersao, VersaoAlteradaRepasseError } from '../../domain/versoes';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Tabela = typeof reclassificacoesRepasse | typeof alternativasPrecoRepasse;
type Nova<T> = Omit<T, 'id' | 'vigenciaDesde' | 'vigenciaAte'> & {
  vigenciaDesde: string;
  vigenciaAte: string | null;
};

const MES_ATUAL = sql`to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')`;

async function aplicar(tx: Tx, t: Tabela, mudancas: MudancaVersao[]) {
  for (const m of mudancas) {
    const onde = and(
      eq(t.id, m.id),
      sql`${t.vigenciaAte} is not distinct from ${m.vigenciaAteAntes}`,
    );
    const r =
      m.tipo === 'remover'
        ? await tx
            .delete(t)
            .where(and(onde, sql`${t.vigenciaDesde} > ${MES_ATUAL}`))
            .returning({ id: t.id })
        : await tx
            .update(t)
            .set({ vigenciaAte: m.vigenciaAte })
            .where(onde)
            .returning({ id: t.id });
    if (!r.length) throw new VersaoAlteradaRepasseError();
  }
}

@Injectable()
export class DrizzleVersoesConfiguracaoRepository implements VersoesConfiguracaoRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async nomes(): Promise<Map<string, string>> {
    const listas = await Promise.all([
      this.db.select({ id: modalidades.id, nome: modalidades.codigo }).from(modalidades),
      this.db.select({ id: especialidades.id, nome: especialidades.nome }).from(especialidades),
      this.db.select({ id: categoriasExame.id, nome: categoriasExame.nome }).from(categoriasExame),
      this.db.select({ id: equipes.id, nome: equipes.nome }).from(equipes),
      this.db.select({ id: contratados.id, nome: contratados.razaoSocial }).from(contratados),
    ]);
    return new Map(listas.flat().map((l) => [l.id, l.nome]));
  }

  async eventos(entidade: string, ids: string[]): Promise<Map<string, EventoDaVersao[]>> {
    const r = new Map<string, EventoDaVersao[]>();
    if (!ids.length) return r;
    const linhas = await this.db
      .select({
        id: eventosAuditoria.entidadeId,
        acao: eventosAuditoria.acao,
        quem: usuarios.nome,
        em: eventosAuditoria.ocorridoEm,
      })
      .from(eventosAuditoria)
      .leftJoin(
        usuarios,
        and(eq(eventosAuditoria.atorTipo, 'usuario'), eq(usuarios.id, eventosAuditoria.atorId)),
      )
      .where(
        and(eq(eventosAuditoria.entidade, entidade), inArray(eventosAuditoria.entidadeId, ids)),
      )
      .orderBy(asc(eventosAuditoria.ocorridoEm));
    for (const { id, ...e } of linhas) r.set(id, [...(r.get(id) ?? []), e]);
    return r;
  }

  gravarReclassificacao(
    mudancas: MudancaVersao[],
    nova: Nova<Reclassificacao> | null,
    por: string,
    em: Date,
  ): Promise<string | null> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('reclassificacoes_repasse'))`);
      await aplicar(tx, reclassificacoesRepasse, mudancas);
      if (!nova) return null;
      const [linha] = await tx
        .insert(reclassificacoesRepasse)
        .values({
          ordem: nova.ordem,
          descricao: nova.descricao,
          todasModalidades: nova.modalidadeIds === null,
          todasEspecialidades: nova.especialidadeIds === null,
          todasCategorias: nova.categoriaIds === null,
          todosMedicos: nova.equipeIds === null,
          especialidadeDestinoId: nova.especialidadeDestinoId,
          categoriaDestinoId: nova.categoriaDestinoId,
          vigenciaDesde: nova.vigenciaDesde,
          vigenciaAte: nova.vigenciaAte,
          criadoPorId: por,
          criadoEm: em,
        })
        .returning({ id: reclassificacoesRepasse.id });
      const id = (linha as { id: string }).id;
      const recortes = [
        ...(nova.modalidadeIds ?? []).map((modalidadeId) => ({
          reclassificacaoId: id,
          modalidadeId,
        })),
        ...(nova.especialidadeIds ?? []).map((especialidadeId) => ({
          reclassificacaoId: id,
          especialidadeId,
        })),
        ...(nova.categoriaIds ?? []).map((categoriaId) => ({ reclassificacaoId: id, categoriaId })),
        ...(nova.equipeIds ?? []).map((equipeId) => ({ reclassificacaoId: id, equipeId })),
      ];
      if (recortes.length) await tx.insert(reclassificacoesRepasseRecortes).values(recortes);
      return id;
    });
  }

  gravarAlternativa(
    mudancas: MudancaVersao[],
    nova: Nova<AlternativaPrecoRepasse> | null,
    por: string,
    em: Date,
  ): Promise<string | null> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('alternativas_preco_repasse'))`);
      await aplicar(tx, alternativasPrecoRepasse, mudancas);
      if (!nova) return null;
      const [linha] = await tx
        .insert(alternativasPrecoRepasse)
        .values({
          ordem: nova.ordem,
          todasEspecialidades: nova.especialidadeId === null,
          especialidadeId: nova.especialidadeId,
          semCategoria: nova.semCategoria,
          categoriaOrigemId: nova.categoriaOrigemId,
          categoriaDestinoId: nova.categoriaDestinoId,
          vigenciaDesde: nova.vigenciaDesde,
          vigenciaAte: nova.vigenciaAte,
          criadoPorId: por,
          criadoEm: em,
        })
        .returning({ id: alternativasPrecoRepasse.id });
      return (linha as { id: string }).id;
    });
  }

  async excluirParametros(id: string): Promise<boolean> {
    const r = await this.db
      .delete(parametrosRepasse)
      .where(
        and(eq(parametrosRepasse.id, id), sql`${parametrosRepasse.vigenciaDesde} > ${MES_ATUAL}`),
      )
      .returning({ id: parametrosRepasse.id });
    return r.length > 0;
  }
}
