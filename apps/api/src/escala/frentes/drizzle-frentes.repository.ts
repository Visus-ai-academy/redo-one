import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, getTableName, ilike, or, type SQL, sql } from 'drizzle-orm';

import { violouChaveEstrangeira } from '../../catalogo/comum/erros-do-banco';
import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import { contem, relevancia } from '../../database/busca';
import { DATABASE, type Database } from '../../database/database';
import {
  alocacoes,
  ausenciasFrentes,
  especialidades,
  frentesEscala,
  modalidades,
  turnosFrentes,
  usuariosEscoposEscala,
} from '../../database/schema';
import type { DestinoFrente } from './frente';
import type { DadosFrente, Frente, FrentesRepository } from './frentes.repository';

const selecao = {
  id: frentesEscala.id,
  tipo: frentesEscala.tipo,
  especialidadeId: frentesEscala.especialidadeId,
  modalidadeId: frentesEscala.modalidadeId,
  rotulo: frentesEscala.rotulo,
  destinoNome: sql<string>`coalesce(${especialidades.nome}, ${modalidades.codigo})`,
  descricao: frentesEscala.descricao,
  cor: frentesEscala.cor,
  ordem: frentesEscala.ordem,
  ativo: frentesEscala.ativo,
};

@Injectable()
export class DrizzleFrentesRepository implements FrentesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Frentes com o item do catálogo para onde apontam. */
  private consulta() {
    return this.db
      .select(selecao)
      .from(frentesEscala)
      .leftJoin(especialidades, eq(especialidades.id, frentesEscala.especialidadeId))
      .leftJoin(modalidades, eq(modalidades.id, frentesEscala.modalidadeId));
  }

  async listar(filtro: FiltroLista) {
    const condicoes: (SQL | undefined)[] = [];
    if (filtro.busca) {
      const padrao = contem(filtro.busca);
      condicoes.push(
        or(ilike(frentesEscala.rotulo, padrao), ilike(frentesEscala.descricao, padrao)),
      );
    }
    if (filtro.ativo !== undefined) condicoes.push(eq(frentesEscala.ativo, filtro.ativo));
    const onde = and(...condicoes);

    const [itens, [linha]] = await Promise.all([
      this.consulta()
        .where(onde)
        .orderBy(
          ...(filtro.busca ? relevancia(frentesEscala.rotulo, filtro.busca) : []),
          asc(frentesEscala.ordem),
          asc(frentesEscala.rotulo),
        )
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db.select({ total: count() }).from(frentesEscala).where(onde),
    ]);
    return { itens: itens as Frente[], total: linha?.total ?? 0 };
  }

  async buscar(id: string) {
    const [frente] = await this.consulta().where(eq(frentesEscala.id, id)).limit(1);
    return (frente as Frente | undefined) ?? null;
  }

  async buscarPorRotulo(rotulo: string) {
    const [frente] = await this.db
      .select({ id: frentesEscala.id })
      .from(frentesEscala)
      .where(sql`lower(${frentesEscala.rotulo}) = lower(${rotulo})`)
      .limit(1);
    return frente ?? null;
  }

  async buscarPorDestino(destino: DestinoFrente) {
    const coluna =
      destino.tipo === 'especialidade' ? frentesEscala.especialidadeId : frentesEscala.modalidadeId;
    const [frente] = await this.db
      .select({ id: frentesEscala.id, rotulo: frentesEscala.rotulo })
      .from(frentesEscala)
      .where(eq(coluna, destino.id))
      .limit(1);
    return frente ?? null;
  }

  async nomeDoDestino(destino: DestinoFrente) {
    const [item] =
      destino.tipo === 'especialidade'
        ? await this.db
            .select({ nome: especialidades.nome })
            .from(especialidades)
            .where(eq(especialidades.id, destino.id))
            .limit(1)
        : await this.db
            .select({ nome: modalidades.codigo })
            .from(modalidades)
            .where(eq(modalidades.id, destino.id))
            .limit(1);
    return item?.nome ?? null;
  }

  async criar(dados: DadosFrente) {
    const [criada] = await this.db
      .insert(frentesEscala)
      .values(dados)
      .returning({ id: frentesEscala.id });
    if (!criada) throw new Error('insert não devolveu o id');
    return criada.id;
  }

  async atualizar(id: string, dados: DadosFrente) {
    await this.db.update(frentesEscala).set(dados).where(eq(frentesEscala.id, id));
  }

  async estaEmUso(id: string) {
    const usa = (tabela: string, coluna: string) =>
      sql`exists (select 1 from ${sql.identifier(tabela)} where ${sql.identifier(coluna)} = ${id})`;
    const [linha] = await this.db
      .execute<{ em_uso: boolean }>(
        sql`select ${sql.join(
          [
            usa(getTableName(turnosFrentes), turnosFrentes.frenteId.name),
            usa(getTableName(alocacoes), alocacoes.frenteId.name),
            usa(getTableName(ausenciasFrentes), ausenciasFrentes.frenteId.name),
            usa(getTableName(usuariosEscoposEscala), usuariosEscoposEscala.frenteId.name),
          ],
          sql` or `,
        )} as em_uso`,
      )
      .then((r) => r.rows);
    return linha?.em_uso === true;
  }

  /**
   * Turno, alocação e ausência barram pela chave estrangeira. O recorte da gestora apagaria em
   * cascata (e sem linha ela passaria a ver tudo), então é conferido antes, com a frente travada.
   */
  async excluir(id: string) {
    try {
      return await this.db.transaction(async (tx) => {
        await tx
          .select({ id: frentesEscala.id })
          .from(frentesEscala)
          .where(eq(frentesEscala.id, id))
          .for('update');
        const [recorte] = await tx
          .select({ id: usuariosEscoposEscala.id })
          .from(usuariosEscoposEscala)
          .where(eq(usuariosEscoposEscala.frenteId, id))
          .limit(1);
        if (recorte) return false;
        await tx.delete(frentesEscala).where(eq(frentesEscala.id, id));
        return true;
      });
    } catch (erro) {
      if (violouChaveEstrangeira(erro)) return false;
      throw erro;
    }
  }
}
