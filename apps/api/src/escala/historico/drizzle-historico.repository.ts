import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lt, type SQL, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import {
  alocacoes,
  chavesRobo,
  clientes,
  eventosAuditoria as e,
  especialidades,
  frentesEscala,
  medicos,
  modalidades,
  prioridades,
  prioridadesOperacao,
  subespecialidades,
  tiposAusencia,
  turnos,
  usuarios,
} from '../../database/schema';
import { ENTIDADES_ESCALA } from '../auditoria-escala';
import type { EscopoEscala } from '../escopo/escopo';
import {
  CATALOGO_DA_FRENTE_F,
  frenteDoCatalogo,
  ROTULO_DA_FRENTE_F,
} from '../frentes/frente-do-catalogo';
import { coletarUuids } from './coletar-uuids';
import type {
  FiltroHistoricoEscala,
  HistoricoEscalaRepository,
  ItemHistoricoEscala,
  PaginaHistoricoEscala,
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

/**
 * A ausência do contexto cobre a coluna: com o "todos" explícito (`todos`), ou com a coluna na
 * lista `campo`. Evento anterior ao "todos" explícito (25/11/2026), sem a chave `todos`: lá, lista
 * vazia queria dizer "todos".
 */
const listaCobre = (
  campo: 'turnoIds' | 'frenteIds',
  todos: 'todosTurnos' | 'todasFrentes',
  coluna: SQL,
) =>
  sql`(coalesce((${ctx}->>${todos})::boolean, jsonb_array_length(coalesce(${ctx}->${campo}, '[]'::jsonb)) = 0) or ${ctx}->${campo} @> to_jsonb(${coluna}::text))`;

/**
 * Recorte da gestora sobre os eventos:
 * - alocação e ajuste: `estaNoEscopo` com `turnoId`/`frenteId` do JSON;
 * - ausência: algum dos `turnoIds`/`frenteIds` explícitos está no recorte, OU o médico tem alguma
 *   alocação (de qualquer período, existente hoje) no recorte que a ausência cobre (ver
 *   `listaCobre`). Assim a ausência "todas as escalas" só aparece para a gestora de quem trabalha no
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
    (${e.entidade} in ('alocacao', 'ajuste_produtividade', 'ajuste_dia_distribuicao')
      and (${campoNoRecorte('turnoId', turnoIds)} or ${campoNoRecorte('frenteId', frenteIds)}))
    or (${e.entidade} = 'ausencia' and (
      ${listaToca('turnoIds', turnoIds)}
      or ${listaToca('frenteIds', frenteIds)}
      or exists (
        select 1 from ${alocacoes}
        where ${alocacoes.medicoId}::text = ${ctx}->>'medicoId'
          and (${alocacaoNoRecorte})
          and ${listaCobre('turnoIds', 'todosTurnos', sql`${alocacoes.turnoId}`)}
          and ${listaCobre('frenteIds', 'todasFrentes', sql`${alocacoes.frenteId}`)}
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

  async listar(filtro: FiltroHistoricoEscala): Promise<PaginaHistoricoEscala> {
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

    const itens: ItemHistoricoEscala[] = linhas.map((l) => ({
      id: l.id,
      ocorridoEm: l.ocorridoEm,
      ator: { tipo: l.atorTipo as ItemHistoricoEscala['ator']['tipo'], nome: l.atorNome },
      entidade: l.entidade,
      entidadeId: l.entidadeId,
      acao: l.acao,
      medico: l.medicoId && l.medicoNome ? { id: l.medicoId, nome: l.medicoNome } : null,
      antes: semUsuarioLegado(l.antes as Json),
      depois: semUsuarioLegado(l.depois as Json),
    }));
    const nomes = await this.nomes(coletarUuids(itens.flatMap((i) => [i.antes, i.depois])));
    return { itens, total: contagem?.total ?? 0, nomes };
  }

  /** Um lote por página: cada tabela consultada uma vez só, com os ids da página. */
  private async nomes(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const turnoDaAlocacao = sql`(select ${turnos.nome} from ${turnos} where ${turnos.id} = ${alocacoes.turnoId})`;
    const frenteDaAlocacao = sql`(select ${ROTULO_DA_FRENTE_F} from frentes_escala f ${CATALOGO_DA_FRENTE_F} where f.id = ${alocacoes.frenteId})`;
    const medicoDaAlocacao = sql`(select ${medicos.nome} from ${medicos} where ${medicos.id} = ${alocacoes.medicoId})`;
    const grupos = await Promise.all([
      this.db
        .select({ id: turnos.id, nome: turnos.nome })
        .from(turnos)
        .where(inArray(turnos.id, ids)),
      this.db
        .select({ id: frentesEscala.id, nome: frenteDoCatalogo.rotulo })
        .from(frentesEscala)
        .leftJoin(especialidades, eq(especialidades.id, frentesEscala.especialidadeId))
        .leftJoin(modalidades, eq(modalidades.id, frentesEscala.modalidadeId))
        .where(inArray(frentesEscala.id, ids)),
      this.db
        .select({ id: tiposAusencia.id, nome: tiposAusencia.nome })
        .from(tiposAusencia)
        .where(inArray(tiposAusencia.id, ids)),
      this.db
        .select({ id: prioridades.id, nome: prioridades.nome })
        .from(prioridades)
        .where(inArray(prioridades.id, ids)),
      // O recorte da alocação é pelas prioridades da operação desde 19/11/2026; antes, do catálogo.
      this.db
        .select({ id: prioridadesOperacao.id, nome: prioridadesOperacao.nome })
        .from(prioridadesOperacao)
        .where(inArray(prioridadesOperacao.id, ids)),
      this.db
        .select({ id: subespecialidades.id, nome: subespecialidades.nome })
        .from(subespecialidades)
        .where(inArray(subespecialidades.id, ids)),
      this.db
        .select({ id: medicos.id, nome: medicos.nome })
        .from(medicos)
        .where(inArray(medicos.id, ids)),
      this.db
        .select({ id: clientes.id, nome: clientes.nome })
        .from(clientes)
        .where(inArray(clientes.id, ids)),
      this.db
        .select({ id: usuarios.id, nome: usuarios.nome })
        .from(usuarios)
        .where(inArray(usuarios.id, ids)),
      this.db
        .select({
          id: alocacoes.id,
          nome: sql<string>`concat_ws(' · ', ${medicoDaAlocacao}, ${turnoDaAlocacao}, ${frenteDaAlocacao})`,
        })
        .from(alocacoes)
        .where(inArray(alocacoes.id, ids)),
    ]);
    return Object.fromEntries(grupos.flat().map((g) => [g.id, g.nome]));
  }
}
