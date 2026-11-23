import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, inArray, sql } from 'drizzle-orm';

import { contem, relevancia } from '../../../database/busca';
import { DATABASE, type Database } from '../../../database/database';
import { avisosCadastro, usuarios } from '../../../database/schema';
import type {
  AvisoCadastro,
  ConsultaAvisos,
  FiltroAvisos,
  StatusAviso,
} from '../../application/ports/avisos.consulta';

const colunas = {
  id: avisosCadastro.id,
  tipo: avisosCadastro.tipo,
  valor: avisosCadastro.valor,
  status: avisosCadastro.status,
  ocorrencias: avisosCadastro.ocorrencias,
  primeiraVezEm: avisosCadastro.primeiraVezEm,
  ultimaVezEm: avisosCadastro.ultimaVezEm,
  decididoPor: sql<{ id: string; nome: string } | null>`case when ${usuarios.id} is null then null
    else json_build_object('id', ${usuarios.id}, 'nome', ${usuarios.nome}) end`,
  decididoEm: avisosCadastro.decididoEm,
  motivo: avisosCadastro.motivo,
};

@Injectable()
export class DrizzleConsultaAvisos implements ConsultaAvisos {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(f: FiltroAvisos) {
    if (f.tipos.length === 0) return { itens: [], total: 0 };
    const onde = and(
      f.status ? eq(avisosCadastro.status, f.status) : undefined,
      inArray(avisosCadastro.tipo, [...f.tipos]),
      f.busca ? ilike(avisosCadastro.valor, contem(f.busca)) : undefined,
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
}
