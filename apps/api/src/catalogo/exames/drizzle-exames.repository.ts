import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, or, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

import { contem, relevancia } from '../../database/busca';
import { DATABASE, type Database } from '../../database/database';
import {
  categoriasExame,
  especialidades,
  exames,
  modalidades,
  prioridades,
  quebrasEstudo,
  quebrasEstudoPecas,
  subespecialidades,
} from '../../database/schema';
import { ReferenciaInexistenteError } from '../comum/catalogo.errors';
import { violouChaveEstrangeira } from '../comum/erros-do-banco';
import type {
  DadosExame,
  ExameDetalhe,
  ExamesRepository,
  FiltroExames,
  Referencia,
} from './exames.repository';

/** `{ id, nome }` do cadastro ligado, por subconsulta; nulo quando o exame não tem. */
function referencia(fk: AnyPgColumn, tabela: PgTable, id: AnyPgColumn, nome: AnyPgColumn) {
  return sql<Referencia | null>`(select json_build_object('id', ${id}, 'nome', ${nome})
    from ${tabela} where ${id} = ${fk})`;
}

const refs = {
  modalidade: referencia(exames.modalidadeId, modalidades, modalidades.id, modalidades.codigo),
  especialidade: referencia(
    exames.especialidadeId,
    especialidades,
    especialidades.id,
    especialidades.nome,
  ),
  subespecialidade: referencia(
    exames.subespecialidadeId,
    subespecialidades,
    subespecialidades.id,
    subespecialidades.nome,
  ),
  categoria: referencia(
    exames.categoriaId,
    categoriasExame,
    categoriasExame.id,
    categoriasExame.nome,
  ),
  prioridade: referencia(exames.prioridadeId, prioridades, prioridades.id, prioridades.nome),
};

/** Grava traduzindo FK inválida para erro de domínio. */
async function gravando<T>(acao: () => Promise<T>): Promise<T> {
  try {
    return await acao();
  } catch (erro) {
    if (violouChaveEstrangeira(erro)) throw new ReferenciaInexistenteError();
    throw erro;
  }
}

@Injectable()
export class DrizzleExamesRepository implements ExamesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(filtro: FiltroExames) {
    const condicoes: (SQL | undefined)[] = [];
    if (filtro.busca) {
      condicoes.push(or(ilike(exames.nome, contem(filtro.busca)), eq(exames.codigo, filtro.busca)));
    }
    if (filtro.modalidadeId) condicoes.push(eq(exames.modalidadeId, filtro.modalidadeId));
    if (filtro.especialidadeId) condicoes.push(eq(exames.especialidadeId, filtro.especialidadeId));
    if (filtro.subespecialidadeId) {
      condicoes.push(eq(exames.subespecialidadeId, filtro.subespecialidadeId));
    }
    if (filtro.ativo !== undefined) condicoes.push(eq(exames.ativo, filtro.ativo));
    const onde = and(...condicoes);

    const [itens, [totalLinha]] = await Promise.all([
      this.db
        .select({
          id: exames.id,
          nome: exames.nome,
          codigo: exames.codigo,
          ...refs,
          exigeRevisaoManual: exames.exigeRevisaoManual,
          ativo: exames.ativo,
        })
        .from(exames)
        .where(onde)
        .orderBy(...(filtro.busca ? relevancia(exames.nome, filtro.busca) : []), asc(exames.nome))
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db.select({ total: count() }).from(exames).where(onde),
    ]);
    return { itens, total: totalLinha?.total ?? 0 };
  }

  async buscar(id: string): Promise<ExameDetalhe | null> {
    const [exame] = await this.db
      .select({
        id: exames.id,
        nome: exames.nome,
        codigo: exames.codigo,
        descricao: exames.descricao,
        modalidadeId: exames.modalidadeId,
        especialidadeId: exames.especialidadeId,
        subespecialidadeId: exames.subespecialidadeId,
        categoriaId: exames.categoriaId,
        prioridadeId: exames.prioridadeId,
        chaveNormalizada: exames.chaveNormalizada,
        permiteQuebra: exames.permiteQuebra,
        exigeRevisaoManual: exames.exigeRevisaoManual,
        ativo: exames.ativo,
      })
      .from(exames)
      .where(eq(exames.id, id))
      .limit(1);
    if (!exame) return null;

    const [quebra] = await this.db
      .select({ id: quebrasEstudo.id, totalPecas: count(quebrasEstudoPecas.id) })
      .from(quebrasEstudo)
      .leftJoin(quebrasEstudoPecas, eq(quebrasEstudoPecas.quebraId, quebrasEstudo.id))
      .where(eq(quebrasEstudo.chaveNormalizada, exame.chaveNormalizada))
      .groupBy(quebrasEstudo.id);
    const { chaveNormalizada: _, ...resto } = exame;
    return { ...resto, quebra: quebra ?? null };
  }

  criar(dados: DadosExame & { chaveNormalizada: string }) {
    return gravando(async () => {
      const [criado] = await this.db.insert(exames).values(dados).returning({ id: exames.id });
      if (!criado) throw new Error('insert de exame não devolveu o id');
      return criado.id;
    });
  }

  async atualizar(id: string, dados: DadosExame & { chaveNormalizada: string }) {
    await gravando(() => this.db.update(exames).set(dados).where(eq(exames.id, id)));
  }

  async excluir(id: string) {
    try {
      await this.db.delete(exames).where(eq(exames.id, id));
      return true;
    } catch (erro) {
      if (violouChaveEstrangeira(erro)) return false;
      throw erro;
    }
  }
}
