import { and, asc, count, eq, ilike, or, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { Database } from '../../database/database';
import { categoriasExame, especialidades, modalidades, prioridades } from '../../database/schema';
import { violouChaveEstrangeira } from '../comum/erros-do-banco';
import type { DadosLista, FiltroLista, ItemLista, ListaRepository } from './lista.repository';

/** Onde fica cada lista: a tabela, a coluna do nome e as colunas a mais (pelo nome no objeto). */
export interface TabelaDeLista {
  tabela: PgTable;
  id: AnyPgColumn;
  /** Propriedade da coluna do nome na tabela Drizzle (`codigo` na modalidade). */
  chaveNome: string;
  colunas: {
    nome: AnyPgColumn;
    descricao: AnyPgColumn;
    cor: AnyPgColumn;
    ordem: AnyPgColumn;
    ativo: AnyPgColumn;
  };
  extras: Record<string, AnyPgColumn>;
}

const lista = (
  tabela: typeof especialidades | typeof categoriasExame | typeof prioridades | typeof modalidades,
  nome: AnyPgColumn,
  chaveNome: string,
  extras: Record<string, AnyPgColumn> = {},
): TabelaDeLista => ({
  tabela,
  id: tabela.id,
  chaveNome,
  colunas: {
    nome,
    descricao: tabela.descricao,
    cor: tabela.cor,
    ordem: tabela.ordem,
    ativo: tabela.ativo,
  },
  extras,
});

export const LISTAS = {
  modalidades: lista(modalidades, modalidades.codigo, 'codigo'),
  especialidades: lista(especialidades, especialidades.nome, 'nome'),
  categoriasExame: lista(categoriasExame, categoriasExame.nome, 'nome'),
  prioridades: lista(prioridades, prioridades.nome, 'nome', { urgente: prioridades.urgente }),
} satisfies Record<string, TabelaDeLista>;

/** Repositório de uma lista do catálogo; uma instância por tabela (ver `catalogo.module.ts`). */
export class DrizzleListaRepository<T extends DadosLista = DadosLista>
  implements ListaRepository<T>
{
  constructor(
    protected readonly db: Database,
    protected readonly t: TabelaDeLista,
  ) {}

  protected get selecao(): Record<string, AnyPgColumn | SQL.Aliased | SQL> {
    return { id: this.t.id, ...this.t.colunas, ...this.t.extras };
  }

  /** Converte os dados do domínio para os nomes de propriedade da tabela. */
  protected valores(dados: T): Record<string, unknown> {
    const { nome, ...resto } = dados;
    return { ...resto, [this.t.chaveNome]: nome };
  }

  async listar(filtro: FiltroLista) {
    const { nome, descricao, ativo, ordem } = this.t.colunas;
    const condicoes: (SQL | undefined)[] = [];
    if (filtro.busca) {
      condicoes.push(or(ilike(nome, `%${filtro.busca}%`), ilike(descricao, `%${filtro.busca}%`)));
    }
    if (filtro.ativo !== undefined) condicoes.push(eq(ativo, filtro.ativo));
    const onde = and(...condicoes);

    const [itens, [totalLinha]] = await Promise.all([
      this.db
        .select(this.selecao)
        .from(this.t.tabela)
        .where(onde)
        .orderBy(asc(ordem), asc(nome))
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db.select({ total: count() }).from(this.t.tabela).where(onde),
    ]);
    return { itens: itens as unknown as ItemLista<T>[], total: totalLinha?.total ?? 0 };
  }

  async buscar(id: string) {
    const [item] = await this.db
      .select(this.selecao)
      .from(this.t.tabela)
      .where(eq(this.t.id, id))
      .limit(1);
    return (item as unknown as ItemLista<T> | undefined) ?? null;
  }

  async buscarPorNome(nome: string) {
    const [item] = await this.db
      .select({ id: this.t.id })
      .from(this.t.tabela)
      .where(sql`lower(${this.t.colunas.nome}) = lower(${nome})`)
      .limit(1);
    return (item as { id: string } | undefined) ?? null;
  }

  async criar(dados: T) {
    const [criado] = await this.db
      .insert(this.t.tabela)
      .values(this.valores(dados) as never)
      .returning({ id: this.t.id });
    if (!criado) throw new Error('insert não devolveu o id');
    return criado.id as string;
  }

  async atualizar(id: string, dados: T) {
    await this.db
      .update(this.t.tabela)
      .set(this.valores(dados) as never)
      .where(eq(this.t.id, id));
  }

  async excluir(id: string) {
    try {
      await this.db.delete(this.t.tabela).where(eq(this.t.id, id));
      return true;
    } catch (erro) {
      if (violouChaveEstrangeira(erro)) return false;
      throw erro;
    }
  }
}
