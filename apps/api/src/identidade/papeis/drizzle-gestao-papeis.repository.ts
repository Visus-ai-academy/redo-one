import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { papeis, papeisPermissoes, usuarios } from '../../database/schema';
import type {
  DadosPapel,
  GestaoPapeisRepository,
  PapelDetalhe,
  PapelResumo,
} from './gestao-papeis.repository';

// Numa consulta de uma tabela só, o Drizzle escreve `papeis.id` como "id", e dentro da subconsulta
// o Postgres o resolveria na tabela de dentro (contagem sempre 0). Por isso o nome vai explícito.
const idDoPapel = sql`${papeis}.${sql.identifier(papeis.id.name)}`;
const totalUsuarios = sql<number>`(select count(*)::int from ${usuarios} where ${usuarios}.${sql.identifier(usuarios.papelId.name)} = ${idDoPapel})`;
const totalPermissoes = sql<number>`(select count(*)::int from ${papeisPermissoes} where ${papeisPermissoes}.${sql.identifier(papeisPermissoes.papelId.name)} = ${idDoPapel})`;

@Injectable()
export class DrizzleGestaoPapeisRepository implements GestaoPapeisRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  listar(): Promise<PapelResumo[]> {
    return this.db
      .select({
        id: papeis.id,
        nome: papeis.nome,
        descricao: papeis.descricao,
        sistema: papeis.sistema,
        acessoTotal: papeis.acessoTotal,
        totalUsuarios,
        totalPermissoes,
      })
      .from(papeis)
      .orderBy(asc(papeis.nome));
  }

  async buscar(id: string): Promise<PapelDetalhe | null> {
    const [papel] = await this.db
      .select({
        id: papeis.id,
        nome: papeis.nome,
        descricao: papeis.descricao,
        sistema: papeis.sistema,
        acessoTotal: papeis.acessoTotal,
        totalUsuarios,
      })
      .from(papeis)
      .where(eq(papeis.id, id))
      .limit(1);
    if (!papel) return null;
    const linhas = await this.db
      .select({ permissao: papeisPermissoes.permissao })
      .from(papeisPermissoes)
      .where(eq(papeisPermissoes.papelId, id))
      .orderBy(asc(papeisPermissoes.permissao));
    return { ...papel, permissoes: linhas.map((l) => l.permissao) };
  }

  async buscarPorNome(nome: string) {
    const [papel] = await this.db
      .select({ id: papeis.id })
      .from(papeis)
      .where(sql`lower(${papeis.nome}) = lower(${nome})`)
      .limit(1);
    return papel ?? null;
  }

  criar(dados: DadosPapel): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [papel] = await tx
        .insert(papeis)
        .values({ nome: dados.nome, descricao: dados.descricao })
        .returning({ id: papeis.id });
      if (!papel) throw new Error('insert de papel não devolveu o id');
      if (dados.permissoes.length) {
        await tx
          .insert(papeisPermissoes)
          .values(dados.permissoes.map((permissao) => ({ papelId: papel.id, permissao })));
      }
      return papel.id;
    });
  }

  async atualizar(id: string, dados: DadosPapel) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(papeis)
        .set({ nome: dados.nome, descricao: dados.descricao })
        .where(eq(papeis.id, id));
      await tx.delete(papeisPermissoes).where(eq(papeisPermissoes.papelId, id));
      if (dados.permissoes.length) {
        await tx
          .insert(papeisPermissoes)
          .values(dados.permissoes.map((permissao) => ({ papelId: id, permissao })));
      }
    });
  }

  async excluir(id: string) {
    await this.db.delete(papeis).where(eq(papeis.id, id));
  }
}
