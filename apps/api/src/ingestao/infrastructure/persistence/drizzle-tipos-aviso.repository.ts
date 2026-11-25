import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray, sql } from 'drizzle-orm';

import { TIPOS_AVISO } from '../../../comum/avisos/registro-avisos';
import { DATABASE, type Database } from '../../../database/database';
import { papeis, tiposAviso, tiposAvisoResponsaveis } from '../../../database/schema';
import type {
  ConfiguracaoTipoAviso,
  TiposAvisoRepository,
} from '../../application/ports/tipos-aviso.repository';
import type { TipoAviso } from '../../domain/preparar-laudo';

const ORDEM = new Map<string, number>(TIPOS_AVISO.map((t, i) => [t, i]));

@Injectable()
export class DrizzleTiposAvisoRepository implements TiposAvisoRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(tipo?: TipoAviso): Promise<ConfiguracaoTipoAviso[]> {
    const linhas = await this.db
      .select({
        tipo: tiposAviso.tipo,
        impedeFecharCompetencia: tiposAviso.impedeFecharCompetencia,
        responsaveis: sql<
          { id: string; nome: string }[]
        >`coalesce((select json_agg(json_build_object('id', p.id, 'nome', p.nome) order by p.nome)
          from ${tiposAvisoResponsaveis} r join ${papeis} p on p.id = r.papel_id
          where r.tipo = tipos_aviso.tipo), '[]'::json)`,
        pendentes: sql<number>`(select count(*)::int from avisos_cadastro a
          where a.tipo = tipos_aviso.tipo and a.status = 'pendente')`,
      })
      .from(tiposAviso)
      .where(tipo ? eq(tiposAviso.tipo, tipo) : undefined);
    return linhas
      .filter((l) => ORDEM.has(l.tipo))
      .sort((a, b) => (ORDEM.get(a.tipo) ?? 0) - (ORDEM.get(b.tipo) ?? 0));
  }

  async obter(tipo: TipoAviso) {
    return (await this.listar(tipo))[0] ?? null;
  }

  async salvar(
    tipo: TipoAviso,
    d: { impedeFecharCompetencia: boolean; papeisIds: readonly string[]; em: Date },
  ) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(tiposAviso)
        .set({ impedeFecharCompetencia: d.impedeFecharCompetencia, atualizadoEm: d.em })
        .where(eq(tiposAviso.tipo, tipo));
      await tx.delete(tiposAvisoResponsaveis).where(eq(tiposAvisoResponsaveis.tipo, tipo));
      if (d.papeisIds.length) {
        await tx
          .insert(tiposAvisoResponsaveis)
          .values(d.papeisIds.map((papelId) => ({ tipo, papelId })));
      }
    });
  }

  async tiposDosPapeis(papeisIds: readonly string[]) {
    if (!papeisIds.length) return [];
    const linhas = await this.db
      .selectDistinct({ tipo: tiposAvisoResponsaveis.tipo })
      .from(tiposAvisoResponsaveis)
      .where(inArray(tiposAvisoResponsaveis.papelId, [...papeisIds]));
    return linhas.map((l) => l.tipo);
  }

  papeis() {
    return this.db
      .select({ id: papeis.id, nome: papeis.nome })
      .from(papeis)
      .orderBy(asc(papeis.nome));
  }

  async papeisInexistentes(ids: readonly string[]) {
    if (!ids.length) return [];
    const achados = new Set(
      (
        await this.db
          .select({ id: papeis.id })
          .from(papeis)
          .where(inArray(papeis.id, [...ids]))
      ).map((p) => p.id),
    );
    return ids.filter((id) => !achados.has(id));
  }
}
