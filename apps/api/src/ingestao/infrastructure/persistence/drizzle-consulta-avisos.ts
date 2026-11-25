import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, inArray, min, sql } from 'drizzle-orm';

import type { EntidadeAviso } from '../../../comum/avisos/registro-avisos';
import { contem, relevancia } from '../../../database/busca';
import { DATABASE, type Database } from '../../../database/database';
import { avisosCadastro, avisosEntidades, usuarios } from '../../../database/schema';
import type {
  AvisoCadastro,
  ConsultaAvisos,
  FiltroAvisos,
  StatusAviso,
} from '../../application/ports/avisos.consulta';
import type { TipoAviso } from '../../domain/preparar-laudo';

const colunas = {
  id: avisosCadastro.id,
  tipo: avisosCadastro.tipo,
  valor: avisosCadastro.valor,
  status: avisosCadastro.status,
  origem: avisosCadastro.origem,
  competencias: sql<
    AvisoCadastro['competencias']
  >`case when ${avisosCadastro.competenciaDesde} is null
    then null else json_build_object('desde', ${avisosCadastro.competenciaDesde}, 'ate', ${avisosCadastro.competenciaAte}) end`,
  entidades: sql<
    EntidadeAviso[]
  >`coalesce((select json_agg(json_build_object('tipo', e.entidade, 'id', e.entidade_id)
    order by e.entidade, e.entidade_id) from ${avisosEntidades} e where e.aviso_id = avisos_cadastro.id), '[]'::json)`,
  ocorrencias: avisosCadastro.ocorrencias,
  primeiraVezEm: avisosCadastro.primeiraVezEm,
  ultimaVezEm: avisosCadastro.ultimaVezEm,
  decididoPor: sql<{ id: string; nome: string } | null>`case when ${usuarios.id} is null then null
    else json_build_object('id', ${usuarios.id}, 'nome', ${usuarios.nome}) end`,
  decididoEm: avisosCadastro.decididoEm,
  motivo: avisosCadastro.motivo,
};

/** O aviso se liga à competência "AAAA-MM" (entre desde e até; até nulo = em diante). */
export const ligadoACompetencia = (competencia: string) =>
  sql`${avisosCadastro.competenciaDesde} <= ${competencia}
    and (${avisosCadastro.competenciaAte} is null or ${avisosCadastro.competenciaAte} >= ${competencia})`;

const refereSe = (e: EntidadeAviso) =>
  sql`exists (select 1 from ${avisosEntidades} e where e.aviso_id = avisos_cadastro.id
    and e.entidade = ${e.tipo} and e.entidade_id = ${e.id})`;

@Injectable()
export class DrizzleConsultaAvisos implements ConsultaAvisos {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(f: FiltroAvisos) {
    if (f.tipos.length === 0) return { itens: [], total: 0 };
    const onde = and(
      f.status ? eq(avisosCadastro.status, f.status) : undefined,
      inArray(avisosCadastro.tipo, [...f.tipos]),
      f.busca ? ilike(avisosCadastro.valor, contem(f.busca)) : undefined,
      f.competencia ? ligadoACompetencia(f.competencia) : undefined,
      f.entidade ? refereSe(f.entidade) : undefined,
    );
    const [itens, [total]] = await Promise.all([
      this.db
        .select(colunas)
        .from(avisosCadastro)
        .leftJoin(usuarios, eq(usuarios.id, avisosCadastro.decididoPorId))
        .where(onde)
        .orderBy(
          ...(f.busca ? relevancia(avisosCadastro.valor, f.busca) : []),
          desc(avisosCadastro.ultimaVezEm),
          avisosCadastro.id,
        )
        .limit(f.porPagina)
        .offset((f.pagina - 1) * f.porPagina),
      this.db.select({ total: count() }).from(avisosCadastro).where(onde),
    ]);
    return { itens, total: total?.total ?? 0 };
  }

  async obter(id: string): Promise<AvisoCadastro | null> {
    const [aviso] = await this.db
      .select(colunas)
      .from(avisosCadastro)
      .leftJoin(usuarios, eq(usuarios.id, avisosCadastro.decididoPorId))
      .where(eq(avisosCadastro.id, id));
    return aviso ?? null;
  }

  async decidir(
    id: string,
    d: { status: StatusAviso; decididoPorId: string; motivo: string | null; em: Date },
  ) {
    await this.db
      .update(avisosCadastro)
      .set({ status: d.status, decididoPorId: d.decididoPorId, motivo: d.motivo, decididoEm: d.em })
      .where(eq(avisosCadastro.id, id));
  }

  async resumoPendentes(tipos: readonly TipoAviso[]) {
    if (!tipos.length) return { total: 0, maisAntigoEm: null };
    const [r] = await this.db
      .select({ total: count(), maisAntigoEm: min(avisosCadastro.primeiraVezEm) })
      .from(avisosCadastro)
      .where(and(eq(avisosCadastro.status, 'pendente'), inArray(avisosCadastro.tipo, [...tipos])));
    return { total: r?.total ?? 0, maisAntigoEm: r?.maisAntigoEm ?? null };
  }

  async pendentesDasEntidades(
    entidade: string,
    ids: readonly string[],
    tipos: readonly TipoAviso[],
  ) {
    if (!ids.length || !tipos.length) return [];
    return this.db
      .select({
        entidadeId: avisosEntidades.entidadeId,
        id: avisosCadastro.id,
        tipo: avisosCadastro.tipo,
        valor: avisosCadastro.valor,
      })
      .from(avisosEntidades)
      .innerJoin(avisosCadastro, eq(avisosCadastro.id, avisosEntidades.avisoId))
      .where(
        and(
          eq(avisosEntidades.entidade, entidade),
          inArray(avisosEntidades.entidadeId, [...ids]),
          eq(avisosCadastro.status, 'pendente'),
          inArray(avisosCadastro.tipo, [...tipos]),
        ),
      )
      .orderBy(avisosEntidades.entidadeId, avisosCadastro.primeiraVezEm, avisosCadastro.id);
  }
}
