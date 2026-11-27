import { Inject, Injectable } from '@nestjs/common';
import { aliasedTable, and, asc, eq, ilike, isNull, or, type SQL, sql } from 'drizzle-orm';

import { violouChaveEstrangeira } from '../../../catalogo/comum/erros-do-banco';
import { contem } from '../../../database/busca';
import { DATABASE, type Database } from '../../../database/database';
import { categoriasFinanceiras as c } from '../../../database/schema';
import type {
  Categoria,
  CategoriasRepository,
  FiltroCategorias,
} from '../../application/ports/categorias.repository';
import type { DadosCategoria, TipoCategoria } from '../../domain/categoria-financeira';

/** As listas de escolha são curtas (dezenas); o teto só protege de surpresa. */
const TETO_OPCOES = 1000;

const pai = aliasedTable(c, 'pai');

const selecao = {
  id: c.id,
  tipo: c.tipo,
  nome: c.nome,
  paiId: c.paiId,
  codigoContabil: c.codigoContabil,
  ativa: c.ativa,
  grupoNome: pai.nome,
  totalFilhas: sql<number>`(select count(*)::int from categorias_financeiras filhas where filhas.pai_id = ${c.id})`,
};

/** Árvore: o grupo (pelo nome) e logo abaixo as categorias dele, por nome. */
const ordemDaArvore = [
  asc(sql`lower(coalesce(${pai.nome}, ${c.nome}))`),
  asc(sql`coalesce(${c.paiId}, ${c.id})`),
  asc(sql`${c.paiId} is not null`),
  asc(sql`lower(${c.nome})`),
];

@Injectable()
export class DrizzleCategoriasRepository implements CategoriasRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(filtro: FiltroCategorias) {
    const condicoes: (SQL | undefined)[] = [eq(c.tipo, filtro.tipo)];
    if (filtro.situacao !== 'todas') condicoes.push(eq(c.ativa, filtro.situacao === 'ativas'));
    if (filtro.busca) {
      const termo = contem(filtro.busca);
      condicoes.push(
        or(ilike(c.nome, termo), ilike(pai.nome, termo), ilike(c.codigoContabil, termo)),
      );
    }
    const onde = and(...condicoes);
    // Em série, não em paralelo: o pool de produção é pequeno (Supabase).
    const itens = await this.db
      .select(selecao)
      .from(c)
      .leftJoin(pai, eq(pai.id, c.paiId))
      .where(onde)
      .orderBy(...ordemDaArvore)
      .limit(filtro.porPagina)
      .offset((filtro.pagina - 1) * filtro.porPagina);
    // Só a agregação com o join: o tipo que o Drizzle infere aqui é `never`.
    const [linha] = (await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(c)
      .leftJoin(pai, eq(pai.id, c.paiId))
      .where(onde)) as { total: number }[];
    return { itens: itens as Categoria[], total: linha?.total ?? 0 };
  }

  async opcoes(tipo?: TipoCategoria) {
    const linhas = await this.db
      .select(selecao)
      .from(c)
      .leftJoin(pai, eq(pai.id, c.paiId))
      .where(and(eq(c.ativa, true), tipo ? eq(c.tipo, tipo) : undefined))
      .orderBy(...ordemDaArvore)
      .limit(TETO_OPCOES);
    return linhas as Categoria[];
  }

  async buscar(id: string) {
    const [linha] = await this.db
      .select(selecao)
      .from(c)
      .leftJoin(pai, eq(pai.id, c.paiId))
      .where(eq(c.id, id));
    return (linha as Categoria | undefined) ?? null;
  }

  async buscarPorNome(tipo: TipoCategoria, paiId: string | null, nome: string) {
    const [linha] = await this.db
      .select({ id: c.id })
      .from(c)
      .where(
        and(
          eq(c.tipo, tipo),
          paiId ? eq(c.paiId, paiId) : isNull(c.paiId),
          sql`lower(${c.nome}) = lower(${nome})`,
        ),
      );
    return linha ?? null;
  }

  async criar(dados: DadosCategoria) {
    const [linha] = await this.db.insert(c).values(dados).returning({ id: c.id });
    if (!linha) throw new Error('o insert não devolveu a categoria');
    return linha.id;
  }

  async atualizar(id: string, dados: DadosCategoria) {
    await this.db.update(c).set(dados).where(eq(c.id, id));
  }

  async excluir(id: string) {
    try {
      await this.db.delete(c).where(eq(c.id, id));
      return true;
    } catch (erro) {
      if (violouChaveEstrangeira(erro)) return false;
      throw erro;
    }
  }
}
