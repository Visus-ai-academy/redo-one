import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, ne, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { contem, relevancia } from '../../database/busca';
import { DATABASE, type Database } from '../../database/database';
import { contratados } from '../../database/schema';
import { violouChaveEstrangeira } from '../comum/erros-do-banco';
import type { FiltroLista } from '../listas/lista.repository';
import type { Contratado, ContratadosRepository, DadosContratado } from './contratados.repository';

const repasse = alias(contratados, 'repasse');

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class DrizzleContratadosRepository implements ContratadosRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private consulta() {
    return this.db
      .select({
        id: contratados.id,
        razaoSocial: contratados.razaoSocial,
        cnpj: contratados.cnpj,
        endereco: contratados.endereco,
        cidade: contratados.cidade,
        uf: contratados.uf,
        cep: contratados.cep,
        contratadoRepasseId: contratados.contratadoRepasseId,
        contratadoRepasseNome: repasse.razaoSocial,
        ativo: contratados.ativo,
        padrao: contratados.padrao,
        usaFinanceiro: contratados.usaFinanceiro,
      })
      .from(contratados)
      .leftJoin(repasse, eq(repasse.id, contratados.contratadoRepasseId));
  }

  async listar(filtro: FiltroLista) {
    const condicoes: (SQL | undefined)[] = [];
    if (filtro.busca) {
      const digitos = filtro.busca.replace(/\D/g, '');
      condicoes.push(
        or(
          ilike(contratados.razaoSocial, contem(filtro.busca)),
          digitos.length === 14 ? eq(contratados.cnpj, digitos) : undefined,
        ),
      );
    }
    if (filtro.ativo !== undefined) condicoes.push(eq(contratados.ativo, filtro.ativo));
    const onde = and(...condicoes);

    const [itens, [totalLinha]] = await Promise.all([
      this.consulta()
        .where(onde)
        .orderBy(
          ...(filtro.busca ? relevancia(contratados.razaoSocial, filtro.busca) : []),
          asc(contratados.razaoSocial),
        )
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db.select({ total: count() }).from(contratados).where(onde),
    ]);
    return { itens, total: totalLinha?.total ?? 0 };
  }

  async buscar(id: string): Promise<Contratado | null> {
    const [contratado] = await this.consulta().where(eq(contratados.id, id)).limit(1);
    return contratado ?? null;
  }

  async buscarPorRazaoSocial(razaoSocial: string) {
    const [linha] = await this.db
      .select({ id: contratados.id })
      .from(contratados)
      .where(sql`lower(${contratados.razaoSocial}) = lower(${razaoSocial})`)
      .limit(1);
    return linha ?? null;
  }

  async buscarPorCnpj(cnpj: string) {
    const [linha] = await this.db
      .select({ id: contratados.id })
      .from(contratados)
      .where(eq(contratados.cnpj, cnpj))
      .limit(1);
    return linha ?? null;
  }

  async consolidadosEm(id: string) {
    const linhas = await this.db
      .select({ razaoSocial: contratados.razaoSocial })
      .from(contratados)
      .where(eq(contratados.contratadoRepasseId, id))
      .orderBy(asc(contratados.razaoSocial));
    return linhas.map((l) => l.razaoSocial);
  }

  async buscarPadrao() {
    const [linha] = await this.db
      .select({ id: contratados.id })
      .from(contratados)
      .where(eq(contratados.padrao, true))
      .limit(1);
    return linha ?? null;
  }

  async criar(dados: DadosContratado) {
    return this.db.transaction(async (tx) => {
      if (dados.padrao) await this.desmarcarPadrao(tx);
      const [criado] = await tx.insert(contratados).values(dados).returning({ id: contratados.id });
      if (!criado) throw new Error('insert de contratado não devolveu o id');
      return criado.id;
    });
  }

  async atualizar(id: string, dados: DadosContratado) {
    await this.db.transaction(async (tx) => {
      if (dados.padrao) await this.desmarcarPadrao(tx, id);
      await tx.update(contratados).set(dados).where(eq(contratados.id, id));
    });
  }

  /** Antes de marcar outro: o índice único parcial aceita um só `padrao`. */
  private async desmarcarPadrao(tx: Transacao, exceto?: string) {
    await tx
      .update(contratados)
      .set({ padrao: false })
      .where(and(eq(contratados.padrao, true), exceto ? ne(contratados.id, exceto) : undefined));
  }

  async excluir(id: string) {
    try {
      await this.db.delete(contratados).where(eq(contratados.id, id));
      return true;
    } catch (erro) {
      if (violouChaveEstrangeira(erro)) return false;
      throw erro;
    }
  }
}
