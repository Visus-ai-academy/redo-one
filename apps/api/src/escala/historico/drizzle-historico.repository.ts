import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lt, type SQL, sql } from 'drizzle-orm';

import type { Pagina } from '../../catalogo/comum/paginacao';
import { DATABASE, type Database } from '../../database/database';
import {
  alocacoes,
  chavesRobo,
  eventosAuditoria as e,
  medicos,
  usuarios,
} from '../../database/schema';
import { ENTIDADES_ESCALA } from '../auditoria-escala';
import type { EscopoEscala } from '../escopo/escopo';
import type {
  FiltroHistoricoEscala,
  HistoricoEscalaRepository,
  ItemHistoricoEscala,
} from './historico.repository';

/** O JSON com as chaves de contexto: `depois`, ou `antes` quando o registro foi removido. */
const ctx = sql`coalesce(${e.depois}, ${e.antes})`;

const lista = (ids: string[]) =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );

/** Alguma das `ids` está na lista JSON `campo` do contexto. */
function listaToca(campo: 'turnoIds' | 'frenteIds', ids: string[]): SQL {
  if (ids.length === 0) return sql`false`;
  return sql`exists (select 1 from jsonb_array_elements_text(coalesce(${ctx}->${campo}, '[]'::jsonb)) as x(id) where x.id in (${lista(ids)}))`;
}

/** A lista JSON `campo` do contexto está vazia (= todos) ou contém a coluna. */
const listaCobre = (campo: 'turnoIds' | 'frenteIds', coluna: SQL) =>
  sql`(jsonb_array_length(coalesce(${ctx}->${campo}, '[]'::jsonb)) = 0 or ${ctx}->${campo} @> to_jsonb(${coluna}::text))`;

/**
 * Recorte da gestora sobre os eventos:
 * - alocação e ajuste: `estaNoEscopo` com `turnoId`/`frenteId` do JSON;
 * - ausência: algum dos `turnoIds`/`frenteIds` explícitos está no recorte, OU o médico tem alguma
 *   alocação (de qualquer período, existente hoje) no recorte que a ausência cobre (lista vazia =
 *   todos). Assim a ausência "todas as escalas" só aparece para a gestora de quem trabalha no
 *   recorte dela;
 * - turno, frente, tipo de ausência e escopo: nunca (só quem não tem recorte).
 */
function noRecorte(escopo: EscopoEscala): SQL {
  const turnoIds = [...escopo.turnoIds];
  const frenteIds = [...escopo.frenteIds];
  if (turnoIds.length === 0 && frenteIds.length === 0) return sql`false`;

  const campoNoRecorte = (campo: 'turnoId' | 'frenteId', ids: string[]) =>
    ids.length === 0 ? sql`false` : sql`${ctx}->>${campo} in (${lista(ids)})`;
  const alocacaoNoRecorte = sql.join(
    [
      ...(turnoIds.length ? [inArray(alocacoes.turnoId, turnoIds)] : []),
      ...(frenteIds.length ? [inArray(alocacoes.frenteId, frenteIds)] : []),
    ],
    sql` or `,
  );

  return sql`(
    (${e.entidade} in ('alocacao', 'ajuste_produtividade')
      and (${campoNoRecorte('turnoId', turnoIds)} or ${campoNoRecorte('frenteId', frenteIds)}))
    or (${e.entidade} = 'ausencia' and (
      ${listaToca('turnoIds', turnoIds)}
      or ${listaToca('frenteIds', frenteIds)}
      or exists (
        select 1 from ${alocacoes}
        where ${alocacoes.medicoId}::text = ${ctx}->>'medicoId'
          and (${alocacaoNoRecorte})
          and ${listaCobre('turnoIds', sql`${alocacoes.turnoId}`)}
          and ${listaCobre('frenteIds', sql`${alocacoes.frenteId}`)}
      )
    ))
  )`;
}

type Json = Record<string, unknown> | null;

/** O nome do autor da carga do legado vira o ator; não é campo alterado. */
function semUsuarioLegado(json: Json): Json {
  if (!json || !('usuarioLegado' in json)) return json;
  const { usuarioLegado: _, ...resto } = json;
  return resto;
}

@Injectable()
export class DrizzleHistoricoEscalaRepository implements HistoricoEscalaRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(filtro: FiltroHistoricoEscala): Promise<Pagina<ItemHistoricoEscala>> {
    const condicoes: SQL[] = [inArray(e.entidade, [...ENTIDADES_ESCALA])];
    if (filtro.entidade) condicoes.push(eq(e.entidade, filtro.entidade));
    if (filtro.medicoId) condicoes.push(sql`${ctx}->>'medicoId' = ${filtro.medicoId}`);
    if (filtro.de) condicoes.push(gte(e.ocorridoEm, filtro.de));
    if (filtro.ateExclusivo) condicoes.push(lt(e.ocorridoEm, filtro.ateExclusivo));
    if (filtro.escopo) condicoes.push(noRecorte(filtro.escopo));
    const onde = and(...condicoes);

    const [linhas, [contagem]] = await Promise.all([
      this.db
        .select({
          id: e.id,
          ocorridoEm: e.ocorridoEm,
          atorTipo: e.atorTipo,
          atorNome: sql<
            string | null
          >`coalesce(${usuarios.nome}, ${chavesRobo.nome}, ${e.depois}->>'usuarioLegado', ${e.antes}->>'usuarioLegado')`,
          entidade: e.entidade,
          entidadeId: e.entidadeId,
          acao: e.acao,
          medicoId: medicos.id,
          medicoNome: medicos.nome,
          antes: e.antes,
          depois: e.depois,
        })
        .from(e)
        .leftJoin(usuarios, and(eq(e.atorTipo, 'usuario'), eq(usuarios.id, e.atorId)))
        .leftJoin(chavesRobo, and(eq(e.atorTipo, 'robo'), eq(chavesRobo.id, e.atorId)))
        .leftJoin(medicos, sql`${medicos.id}::text = ${ctx}->>'medicoId'`)
        .where(onde)
        .orderBy(desc(e.ocorridoEm), desc(e.id))
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db.select({ total: sql<number>`count(*)::int` }).from(e).where(onde),
    ]);

    return {
      total: contagem?.total ?? 0,
      itens: linhas.map((l) => ({
        id: l.id,
        ocorridoEm: l.ocorridoEm,
        ator: { tipo: l.atorTipo as ItemHistoricoEscala['ator']['tipo'], nome: l.atorNome },
        entidade: l.entidade,
        entidadeId: l.entidadeId,
        acao: l.acao,
        medico: l.medicoId && l.medicoNome ? { id: l.medicoId, nome: l.medicoNome } : null,
        antes: semUsuarioLegado(l.antes as Json),
        depois: semUsuarioLegado(l.depois as Json),
      })),
    };
  }
}
