import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gte, ilike, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';

import type { EventoAuditoria } from '../../auditoria/auditoria';
import { violouChaveEstrangeira } from '../../catalogo/comum/erros-do-banco';
import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import { contem, relevancia } from '../../database/busca';
import { DATABASE, type Database } from '../../database/database';
import {
  alocacoes,
  especialidades,
  modalidades,
  turnos,
  turnosFrentes,
  usuariosEscoposEscala,
} from '../../database/schema';
import { gravarEventos } from '../alocacoes/drizzle-alocacoes.repository';
import {
  CATALOGO_DA_FRENTE_F,
  ORDEM_DA_FRENTE_F,
  ROTULO_DA_FRENTE_F,
} from '../frentes/frente-do-catalogo';
import { type DestinosFrentes, garantirFrentes } from '../frentes/garantir-frentes';
import type { DadosTurno } from './turno';
import type { FrenteDoTurno, TurnoGravado, TurnosRepository } from './turnos.repository';

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Frentes do turno com o nome do catálogo, especialidades e depois modalidades. Nomes por extenso:
 * numa consulta de uma tabela só o Drizzle escreve as colunas sem a tabela, e dentro da
 * subconsulta o `id` seria o da frente.
 */
const frentesDoTurno = sql<FrenteDoTurno[]>`(
  select coalesce(json_agg(json_build_object(
    'id', f.id, 'rotulo', ${ROTULO_DA_FRENTE_F}, 'tipo', f.tipo,
    'especialidadeId', f.especialidade_id, 'modalidadeId', f.modalidade_id
  ) order by ${ORDEM_DA_FRENTE_F}), '[]'::json)
  from turnos_frentes tf join frentes_escala f on f.id = tf.frente_id ${CATALOGO_DA_FRENTE_F}
  where tf.turno_id = "turnos"."id"
)`;

/** Ids no catálogo das frentes do turno de um tipo, ordenados. */
const idsDoCatalogo = (coluna: 'especialidade_id' | 'modalidade_id') => sql<string[]>`array(
  select f.${sql.raw(coluna)}::text from turnos_frentes tf join frentes_escala f on f.id = tf.frente_id
  where tf.turno_id = "turnos"."id" and f.${sql.raw(coluna)} is not null
  order by 1
)`;

const selecao = {
  id: turnos.id,
  nome: turnos.nome,
  tipo: turnos.tipo,
  horarioInicio: turnos.horarioInicio,
  horarioFim: turnos.horarioFim,
  frentes: frentesDoTurno,
  especialidadeIds: idsDoCatalogo('especialidade_id'),
  modalidadeIds: idsDoCatalogo('modalidade_id'),
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

  async noCatalogo({ especialidadeIds, modalidadeIds }: DestinosFrentes) {
    const [esp, mod] = await Promise.all([
      especialidadeIds.length
        ? this.db
            .select({ id: especialidades.id })
            .from(especialidades)
            .where(inArray(especialidades.id, [...especialidadeIds]))
        : [],
      modalidadeIds.length
        ? this.db
            .select({ id: modalidades.id })
            .from(modalidades)
            .where(inArray(modalidades.id, [...modalidadeIds]))
        : [],
    ]);
    const existe = (ids: readonly string[], linhas: { id: string }[]) => {
      const achados = new Set(linhas.map((l) => l.id));
      return ids.filter((id) => achados.has(id));
    };
    return {
      especialidadeIds: existe(especialidadeIds, esp),
      modalidadeIds: existe(modalidadeIds, mod),
    };
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

  criar(
    dados: DadosTurno,
    eventosDe: (gravado: { id: string; frenteIds: string[] }) => EventoAuditoria[],
  ) {
    return this.db.transaction(async (tx) => {
      const { especialidadeIds, modalidadeIds, ...turno } = dados;
      const [criado] = await tx.insert(turnos).values(turno).returning({ id: turnos.id });
      if (!criado) throw new Error('insert não devolveu o id');
      const frenteIds = await gravarFrentes(tx, criado.id, { especialidadeIds, modalidadeIds });
      const gravado = { id: criado.id, frenteIds };
      await gravarEventos(tx, eventosDe(gravado));
      return gravado;
    });
  }

  atualizar(
    id: string,
    dados: DadosTurno,
    eventosDe: (gravado: { frenteIds: string[] }) => EventoAuditoria[],
  ) {
    const { especialidadeIds, modalidadeIds, ...turno } = dados;
    return this.db.transaction(async (tx) => {
      await tx.update(turnos).set(turno).where(eq(turnos.id, id));
      await tx.delete(turnosFrentes).where(eq(turnosFrentes.turnoId, id));
      const frenteIds = await gravarFrentes(tx, id, { especialidadeIds, modalidadeIds });
      await gravarEventos(tx, eventosDe({ frenteIds }));
      return { frenteIds };
    });
  }

  /**
   * Alocação e ausência barram pela chave estrangeira. O recorte da gestora apagaria em cascata
   * (e sem linha ela passaria a ver tudo), então é conferido antes, com o turno travado.
   */
  async excluir(id: string, eventos: EventoAuditoria[]) {
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
        await gravarEventos(tx, eventos);
        return true;
      });
    } catch (erro) {
      if (violouChaveEstrangeira(erro)) return false;
      throw erro;
    }
  }
}

/** Garante a frente de cada item do catálogo e liga ao turno; devolve os ids das frentes. */
async function gravarFrentes(tx: Transacao, turnoId: string, destinos: DestinosFrentes) {
  const frenteIds = await garantirFrentes(tx, destinos);
  if (frenteIds.length) {
    await tx.insert(turnosFrentes).values(frenteIds.map((frenteId) => ({ turnoId, frenteId })));
  }
  return frenteIds;
}
