import { Inject, Injectable } from '@nestjs/common';
import { asc, count, eq, exists, ilike, or, sql } from 'drizzle-orm';

import { contem, relevancia } from '../../database/busca';
import { DATABASE, type Database } from '../../database/database';
import { categoriasExame, exames, quebrasEstudo, quebrasEstudoPecas } from '../../database/schema';
import { ReferenciaInexistenteError } from '../comum/catalogo.errors';
import { violouChaveEstrangeira } from '../comum/erros-do-banco';
import type {
  DadosPeca,
  FiltroQuebras,
  QuebraDetalhe,
  QuebrasRepository,
  Referencia,
} from './quebras.repository';

// Colunas da quebra qualificadas: dentro de subconsulta o Drizzle as escreve sem a tabela.
const idDaQuebra = sql.raw('"quebras_estudo"."id"');
const chaveDaQuebra = sql.raw('"quebras_estudo"."chave_normalizada"');

/** O exame do cadastro com o mesmo nome (chave) do estudo; o primeiro em ordem de nome. */
const exameDoEstudo = sql<Referencia | null>`(select json_build_object('id', e.id, 'nome', e.nome)
  from ${exames} e where e.chave_normalizada = ${chaveDaQuebra}
  order by e.nome limit 1)`;

/** Grava traduzindo FK inválida (categoria ou exame que sumiu) para erro de domínio. */
async function gravando<T>(acao: () => Promise<T>): Promise<T> {
  try {
    return await acao();
  } catch (erro) {
    if (violouChaveEstrangeira(erro)) throw new ReferenciaInexistenteError();
    throw erro;
  }
}

@Injectable()
export class DrizzleQuebrasRepository implements QuebrasRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(filtro: FiltroQuebras) {
    const onde = filtro.busca
      ? or(
          ilike(quebrasEstudo.estudoOrigem, contem(filtro.busca)),
          exists(
            this.db
              .select({ um: sql`1` })
              .from(quebrasEstudoPecas)
              .innerJoin(exames, eq(exames.id, quebrasEstudoPecas.exameId))
              .where(
                sql`${quebrasEstudoPecas.quebraId} = ${idDaQuebra} and ${exames.nome} ilike ${contem(filtro.busca)}`,
              ),
          ),
        )
      : undefined;
    const pecas = sql<{ nome: string; ativo: boolean }[]>`coalesce((
      select json_agg(json_build_object('nome', e.nome, 'ativo', p.ativo) order by e.nome)
      from ${quebrasEstudoPecas} p join ${exames} e on e.id = p.exame_id
      where p.quebra_id = ${idDaQuebra}), '[]'::json)`;

    const [itens, [totalLinha]] = await Promise.all([
      this.db
        .select({
          id: quebrasEstudo.id,
          estudoOrigem: quebrasEstudo.estudoOrigem,
          pecas,
          exame: exameDoEstudo,
        })
        .from(quebrasEstudo)
        .where(onde)
        .orderBy(
          ...(filtro.busca ? relevancia(quebrasEstudo.estudoOrigem, filtro.busca) : []),
          asc(quebrasEstudo.estudoOrigem),
        )
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db.select({ total: count() }).from(quebrasEstudo).where(onde),
    ]);
    return { itens, total: totalLinha?.total ?? 0 };
  }

  async buscar(id: string): Promise<QuebraDetalhe | null> {
    const [quebra] = await this.db
      .select({
        id: quebrasEstudo.id,
        estudoOrigem: quebrasEstudo.estudoOrigem,
        chaveNormalizada: quebrasEstudo.chaveNormalizada,
        exame: exameDoEstudo,
      })
      .from(quebrasEstudo)
      .where(eq(quebrasEstudo.id, id))
      .limit(1);
    if (!quebra) return null;

    const linhas = await this.db
      .select({
        id: quebrasEstudoPecas.id,
        exameId: exames.id,
        exameNome: exames.nome,
        categoriaId: categoriasExame.id,
        categoriaNome: categoriasExame.nome,
        ativo: quebrasEstudoPecas.ativo,
      })
      .from(quebrasEstudoPecas)
      .innerJoin(exames, eq(exames.id, quebrasEstudoPecas.exameId))
      .leftJoin(categoriasExame, eq(categoriasExame.id, quebrasEstudoPecas.categoriaId))
      .where(eq(quebrasEstudoPecas.quebraId, id))
      .orderBy(asc(exames.nome));
    return {
      ...quebra,
      pecas: linhas.map((p) => ({
        id: p.id,
        exame: { id: p.exameId, nome: p.exameNome },
        categoria:
          p.categoriaId && p.categoriaNome ? { id: p.categoriaId, nome: p.categoriaNome } : null,
        ativo: p.ativo,
      })),
    };
  }

  async buscarPorChave(chave: string) {
    const [quebra] = await this.db
      .select({ id: quebrasEstudo.id, estudoOrigem: quebrasEstudo.estudoOrigem })
      .from(quebrasEstudo)
      .where(eq(quebrasEstudo.chaveNormalizada, chave))
      .limit(1);
    return quebra ?? null;
  }

  async buscarExame(id: string) {
    const [exame] = await this.db
      .select({ nome: exames.nome, chaveNormalizada: exames.chaveNormalizada })
      .from(exames)
      .where(eq(exames.id, id))
      .limit(1);
    return exame ?? null;
  }

  async criar(dados: { estudoOrigem: string; chaveNormalizada: string }) {
    const [criada] = await this.db
      .insert(quebrasEstudo)
      .values(dados)
      .returning({ id: quebrasEstudo.id });
    if (!criada) throw new Error('insert de quebra não devolveu o id');
    return criada.id;
  }

  async atualizar(id: string, dados: { estudoOrigem: string; chaveNormalizada: string }) {
    await this.db.update(quebrasEstudo).set(dados).where(eq(quebrasEstudo.id, id));
  }

  async excluir(id: string) {
    await this.db.delete(quebrasEstudo).where(eq(quebrasEstudo.id, id));
  }

  criarPeca(quebraId: string, dados: DadosPeca) {
    return gravando(async () => {
      const [criada] = await this.db
        .insert(quebrasEstudoPecas)
        .values({ ...dados, quebraId })
        .returning({ id: quebrasEstudoPecas.id });
      if (!criada) throw new Error('insert de peça de quebra não devolveu o id');
      return criada.id;
    });
  }

  async atualizarPeca(pecaId: string, dados: DadosPeca) {
    await gravando(() =>
      this.db.update(quebrasEstudoPecas).set(dados).where(eq(quebrasEstudoPecas.id, pecaId)),
    );
  }

  async excluirPeca(pecaId: string) {
    await this.db.delete(quebrasEstudoPecas).where(eq(quebrasEstudoPecas.id, pecaId));
  }
}
