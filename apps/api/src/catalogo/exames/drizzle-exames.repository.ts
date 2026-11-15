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
  regrasQuebraExame,
  subespecialidades,
} from '../../database/schema';
import { ReferenciaInexistenteError } from '../comum/catalogo.errors';
import { violouChaveEstrangeira } from '../comum/erros-do-banco';
import type {
  DadosExame,
  DadosRegraQuebra,
  ExameDetalhe,
  ExamesRepository,
  FiltroExames,
  Referencia,
  RegraQuebra,
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
        permiteQuebra: exames.permiteQuebra,
        exigeRevisaoManual: exames.exigeRevisaoManual,
        ativo: exames.ativo,
      })
      .from(exames)
      .where(eq(exames.id, id))
      .limit(1);
    if (!exame) return null;

    const regras = await this.db
      .select({
        id: regrasQuebraExame.id,
        exameDestinoId: exames.id,
        exameDestinoNome: exames.nome,
        categoriaId: categoriasExame.id,
        categoriaNome: categoriasExame.nome,
        ativo: regrasQuebraExame.ativo,
      })
      .from(regrasQuebraExame)
      .innerJoin(exames, eq(exames.id, regrasQuebraExame.exameDestinoId))
      .leftJoin(categoriasExame, eq(categoriasExame.id, regrasQuebraExame.categoriaId))
      .where(eq(regrasQuebraExame.exameOrigemId, id))
      .orderBy(asc(exames.nome));
    const regrasQuebra: RegraQuebra[] = regras.map((r) => ({
      id: r.id,
      exameDestino: { id: r.exameDestinoId, nome: r.exameDestinoNome },
      categoria:
        r.categoriaId && r.categoriaNome ? { id: r.categoriaId, nome: r.categoriaNome } : null,
      ativo: r.ativo,
    }));
    return { ...exame, regrasQuebra };
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

  criarRegraQuebra(exameOrigemId: string, dados: DadosRegraQuebra) {
    return gravando(async () => {
      const [criada] = await this.db
        .insert(regrasQuebraExame)
        .values({ ...dados, exameOrigemId })
        .returning({ id: regrasQuebraExame.id });
      if (!criada) throw new Error('insert de regra de quebra não devolveu o id');
      return criada.id;
    });
  }

  async atualizarRegraQuebra(regraId: string, dados: DadosRegraQuebra) {
    await gravando(() =>
      this.db.update(regrasQuebraExame).set(dados).where(eq(regrasQuebraExame.id, regraId)),
    );
  }

  async excluirRegraQuebra(regraId: string) {
    await this.db.delete(regrasQuebraExame).where(eq(regrasQuebraExame.id, regraId));
  }
}
