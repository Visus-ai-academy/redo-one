import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gte, ilike, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';

import { violouChaveEstrangeira } from '../../catalogo/comum/erros-do-banco';
import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import { contem, relevancia } from '../../database/busca';
import { DATABASE, type Database } from '../../database/database';
import {
  alocacoes,
  frentesEscala,
  turnos,
  turnosFrentes,
  usuariosEscoposEscala,
} from '../../database/schema';
import type { DadosTurno } from './turno';
import type { FrenteDoTurno, TurnoGravado, TurnosRepository } from './turnos.repository';

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Frentes do turno pela ordem da frente. Nomes por extenso: numa consulta de uma tabela só o
 * Drizzle escreve as colunas sem a tabela, e dentro da subconsulta o `id` seria o da frente.
 */
const frentesDoTurno = sql<FrenteDoTurno[]>`(
  select coalesce(json_agg(json_build_object('id', f.id, 'rotulo', f.rotulo) order by f.ordem, f.rotulo), '[]'::json)
  from turnos_frentes tf join frentes_escala f on f.id = tf.frente_id
  where tf.turno_id = "turnos"."id"
)`;

const selecao = {
  id: turnos.id,
  nome: turnos.nome,
  tipo: turnos.tipo,
  horarioInicio: turnos.horarioInicio,
  horarioFim: turnos.horarioFim,
  frentes: frentesDoTurno,
  descricao: turnos.descricao,
  cor: turnos.cor,
  ordem: turnos.ordem,
  ativo: turnos.ativo,
};

@Injectable()
export class DrizzleTurnosRepository implements TurnosRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(filtro: FiltroLista) {
    const condicoes: (SQL | undefined)[] = [];
    if (filtro.busca) {
      const padrao = contem(filtro.busca);
      condicoes.push(or(ilike(turnos.nome, padrao), ilike(turnos.descricao, padrao)));
    }
    if (filtro.ativo !== undefined) condicoes.push(eq(turnos.ativo, filtro.ativo));
    const onde = and(...condicoes);

    const [itens, [linha]] = await Promise.all([
      this.db
        .select(selecao)
        .from(turnos)
        .where(onde)
        .orderBy(
          ...(filtro.busca ? relevancia(turnos.nome, filtro.busca) : []),
          asc(turnos.ordem),
          asc(turnos.nome),
        )
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db.select({ total: count() }).from(turnos).where(onde),
    ]);
    return { itens: itens as TurnoGravado[], total: linha?.total ?? 0 };
  }

  async buscar(id: string) {
    const [turno] = await this.db.select(selecao).from(turnos).where(eq(turnos.id, id)).limit(1);
    return (turno as TurnoGravado | undefined) ?? null;
  }

  async buscarPorNome(nome: string) {
    const [turno] = await this.db
      .select({ id: turnos.id })
      .from(turnos)
      .where(sql`lower(${turnos.nome}) = lower(${nome})`)
      .limit(1);
    return turno ?? null;
  }

  async frentes(ids: string[]) {
    if (!ids.length) return [];
    return this.db
      .select({ id: frentesEscala.id, rotulo: frentesEscala.rotulo })
      .from(frentesEscala)
      .where(inArray(frentesEscala.id, ids));
  }

  alocacoesVigentes(turnoId: string, hoje: string) {
    return this.db
      .select({
        frenteId: alocacoes.frenteId,
        horarioInicio: alocacoes.horarioInicio,
        horarioFim: alocacoes.horarioFim,
        gratificado: alocacoes.gratificado,
      })
      .from(alocacoes)
      .where(
        and(
          eq(alocacoes.turnoId, turnoId),
          or(isNull(alocacoes.dataFim), gte(alocacoes.dataFim, hoje)),
        ),
      );
  }

  criar(dados: DadosTurno) {
    return this.db.transaction(async (tx) => {
      const { frenteIds, ...turno } = dados;
      const [criado] = await tx.insert(turnos).values(turno).returning({ id: turnos.id });
      if (!criado) throw new Error('insert não devolveu o id');
      await gravarFrentes(tx, criado.id, frenteIds);
      return criado.id;
    });
  }

  async atualizar(id: string, dados: DadosTurno) {
    const { frenteIds, ...turno } = dados;
    await this.db.transaction(async (tx) => {
      await tx.update(turnos).set(turno).where(eq(turnos.id, id));
      await tx.delete(turnosFrentes).where(eq(turnosFrentes.turnoId, id));
      await gravarFrentes(tx, id, frenteIds);
    });
  }

  /**
   * Alocação e ausência barram pela chave estrangeira. O recorte da gestora apagaria em cascata
   * (e sem linha ela passaria a ver tudo), então é conferido antes, com o turno travado.
   */
  async excluir(id: string) {
    try {
      return await this.db.transaction(async (tx) => {
        await tx.select({ id: turnos.id }).from(turnos).where(eq(turnos.id, id)).for('update');
        const [recorte] = await tx
          .select({ id: usuariosEscoposEscala.id })
          .from(usuariosEscoposEscala)
          .where(eq(usuariosEscoposEscala.turnoId, id))
          .limit(1);
        if (recorte) return false;
        await tx.delete(turnos).where(eq(turnos.id, id));
        return true;
      });
    } catch (erro) {
      if (violouChaveEstrangeira(erro)) return false;
      throw erro;
    }
  }
}

async function gravarFrentes(tx: Transacao, turnoId: string, frenteIds: string[]) {
  if (!frenteIds.length) return;
  await tx.insert(turnosFrentes).values(frenteIds.map((frenteId) => ({ turnoId, frenteId })));
}
