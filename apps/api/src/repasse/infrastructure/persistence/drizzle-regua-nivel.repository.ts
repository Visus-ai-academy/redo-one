import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNotNull, or, sql } from 'drizzle-orm';

import type { EventoAuditoria } from '../../../auditoria/auditoria';
import { DATABASE, type Database } from '../../../database/database';
import {
  categoriasExame,
  competencias,
  especialidades,
  eventosAuditoria,
  exames,
  medicos,
  modalidades,
  niveisMedico,
  prioridades,
  reguasRepasseNivel,
  usuarios,
} from '../../../database/schema';
import type { EventoDaVersao } from '../../application/ports/regras-medico.repository';
import type {
  LinhaReguaLida,
  ReguaNivelRepository,
} from '../../application/ports/regua-nivel.repository';
import { ENTIDADE_REGUA } from '../../application/use-cases/regua-nivel';
import { type DadosRegua, ReguaConflitanteError } from '../../domain/regua-nivel';
import { type MudancaVersao, VersaoAlteradaRepasseError } from '../../domain/versoes';
import { mesAno } from '../../domain/versoes-preco';
import { VigenciaRepasseInvalidaError } from '../../domain/vigencia';

const t = reguasRepasseNivel;

@Injectable()
export class DrizzleReguaNivelRepository implements ReguaNivelRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async bloqueadas(): Promise<string[]> {
    const linhas = await this.db
      .select({ competencia: competencias.competencia })
      .from(competencias)
      .where(or(eq(competencias.status, 'fechada'), isNotNull(competencias.importacaoTravadaEm)));
    return linhas.map((l) => l.competencia);
  }

  async nomeDoNivel(nivelId: string): Promise<string | null> {
    const [n] = await this.db
      .select({ nome: niveisMedico.nome })
      .from(niveisMedico)
      .where(eq(niveisMedico.id, nivelId));
    return n?.nome ?? null;
  }

  async listar(nivelId: string): Promise<LinhaReguaLida[]> {
    const linhas = await this.db
      .select({
        id: t.id,
        nivelId: t.nivelId,
        modalidadeId: t.modalidadeId,
        especialidadeId: t.especialidadeId,
        categoriaId: t.categoriaId,
        prioridadeId: t.prioridadeId,
        valorCentavos: t.valorCentavos,
        vigenciaDesde: t.vigenciaDesde,
        vigenciaAte: t.vigenciaAte,
        modalidade: modalidades.codigo,
        especialidade: especialidades.nome,
        categoria: categoriasExame.nome,
        prioridade: prioridades.nome,
      })
      .from(t)
      .innerJoin(modalidades, eq(modalidades.id, t.modalidadeId))
      .innerJoin(especialidades, eq(especialidades.id, t.especialidadeId))
      .leftJoin(categoriasExame, eq(categoriasExame.id, t.categoriaId))
      .leftJoin(prioridades, eq(prioridades.id, t.prioridadeId))
      .where(eq(t.nivelId, nivelId));
    return linhas.map(({ modalidade, especialidade, categoria, prioridade, ...l }) => ({
      ...l,
      nomes: { modalidade, especialidade, categoria, prioridade },
    }));
  }

  async gravar(g: {
    nivelId: string;
    usuarioId: string;
    aPartirDe: string;
    mudancas: MudancaVersao[];
    nova: (DadosRegua & { id: string; vigenciaDesde: string; vigenciaAte: string | null }) | null;
    eventos: EventoAuditoria[];
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`regua:${g.nivelId}`}))`);
      const bloqueadas = (
        await tx
          .select({
            competencia: competencias.competencia,
            status: competencias.status,
            travadaEm: competencias.importacaoTravadaEm,
          })
          .from(competencias)
          .where(gte(competencias.competencia, g.aPartirDe))
          .for('share')
      ).filter((c) => c.status === 'fechada' || c.travadaEm !== null);
      if (bloqueadas.length)
        throw new VigenciaRepasseInvalidaError(
          `A competência ${mesAno(bloqueadas[0]?.competencia as string)} acabou de ser fechada ou travada. Recarregue e escolha outra.`,
        );
      for (const m of g.mudancas) {
        const onde = and(
          eq(t.id, m.id),
          eq(t.nivelId, g.nivelId),
          sql`${t.vigenciaAte} is not distinct from ${m.vigenciaAteAntes}`,
        );
        const r =
          m.tipo === 'remover'
            ? await tx
                .delete(t)
                .where(
                  and(
                    onde,
                    sql`${t.vigenciaDesde} > to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')`,
                  ),
                )
                .returning({ id: t.id })
            : await tx
                .update(t)
                .set({ vigenciaAte: m.vigenciaAte })
                .where(onde)
                .returning({ id: t.id });
        if (!r.length) throw new VersaoAlteradaRepasseError();
      }
      if (g.nova) {
        const n = g.nova;
        const cruzadas = await tx.execute(sql`
          select 1 from reguas_repasse_nivel
          where nivel_id = ${n.nivelId} and modalidade_id = ${n.modalidadeId}
            and especialidade_id = ${n.especialidadeId}
            and categoria_id is not distinct from ${n.categoriaId}::uuid
            and prioridade_id is not distinct from ${n.prioridadeId}::uuid
            and (vigencia_ate is null or vigencia_ate >= ${n.vigenciaDesde})
            and (${n.vigenciaAte}::text is null or vigencia_desde is null or vigencia_desde <= ${n.vigenciaAte})
          limit 1`);
        if (cruzadas.rows.length) throw new ReguaConflitanteError();
        await tx.insert(t).values({
          id: n.id,
          nivelId: n.nivelId,
          modalidadeId: n.modalidadeId,
          especialidadeId: n.especialidadeId,
          todasCategorias: n.categoriaId === null,
          categoriaId: n.categoriaId,
          todasPrioridades: n.prioridadeId === null,
          prioridadeId: n.prioridadeId,
          valorCentavos: n.valorCentavos,
          vigenciaDesde: n.vigenciaDesde,
          vigenciaAte: n.vigenciaAte,
          criadoPorId: g.usuarioId,
        });
      }
      if (g.eventos.length)
        await tx.insert(eventosAuditoria).values(
          g.eventos.map((e) => ({
            ocorridoEm: e.em,
            atorTipo: e.ator.tipo,
            atorId: e.ator.id ?? null,
            entidade: e.entidade,
            entidadeId: e.entidadeId,
            acao: e.acao,
            antes: e.antes ?? null,
            depois: e.depois ?? null,
          })),
        );
    });
  }

  async eventos(ids: string[]): Promise<Map<string, EventoDaVersao[]>> {
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
        and(
          eq(eventosAuditoria.entidade, ENTIDADE_REGUA),
          inArray(eventosAuditoria.entidadeId, ids),
        ),
      )
      .orderBy(asc(eventosAuditoria.ocorridoEm));
    for (const { id, ...e } of linhas) r.set(id, [...(r.get(id) ?? []), e]);
    return r;
  }

  async nivelDoMedico(medicoId: string) {
    const [m] = await this.db
      .select({ nivelId: medicos.nivelId, nivel: niveisMedico.nome })
      .from(medicos)
      .leftJoin(niveisMedico, eq(niveisMedico.id, medicos.nivelId))
      .where(eq(medicos.id, medicoId));
    if (!m) return undefined;
    return m.nivelId && m.nivel ? { id: m.nivelId, nome: m.nivel } : null;
  }

  async catalogo() {
    const categorias = await this.db
      .selectDistinct({
        modalidadeId: exames.modalidadeId,
        especialidadeId: exames.especialidadeId,
        categoriaId: exames.categoriaId,
      })
      .from(exames)
      .innerJoin(categoriasExame, eq(categoriasExame.id, exames.categoriaId))
      .where(
        and(
          eq(exames.ativo, true),
          eq(categoriasExame.ativo, true),
          isNotNull(exames.modalidadeId),
          isNotNull(exames.especialidadeId),
        ),
      );
    const prios = await this.db
      .select({ id: prioridades.id })
      .from(prioridades)
      .where(eq(prioridades.ativo, true))
      .orderBy(asc(prioridades.ordem));
    return {
      categorias: categorias.map((c) => ({
        modalidadeId: c.modalidadeId as string,
        especialidadeId: c.especialidadeId as string,
        categoriaId: c.categoriaId as string,
      })),
      prioridades: prios.map((p) => p.id),
    };
  }
}
