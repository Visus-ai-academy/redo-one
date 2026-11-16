import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { EventoAuditoria } from '../../auditoria/auditoria';
import { contem } from '../../database/busca';
import { DATABASE, type Database } from '../../database/database';
import {
  alocacoes,
  ausencias,
  ausenciasFrentes,
  ausenciasTurnos,
  eventosAuditoria,
  frentesEscala,
  medicos,
  tiposAusencia,
  turnos,
  usuarios,
} from '../../database/schema';
import type { EscopoEscala } from '../escopo/escopo';
import {
  CATALOGO_DA_FRENTE_F,
  ORDEM_DA_FRENTE_F,
  ROTULO_DA_FRENTE_F,
} from '../frentes/frente-do-catalogo';
import type {
  AusenciaDetalhada,
  AusenciasRepository,
  DadosAusenciaGravada,
  FiltroAusencias,
  NovaAusencia,
  Referencia,
  RevisaoGravada,
} from './ausencias.repository';

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

const solicitante = alias(usuarios, 'solicitante');
const revisor = alias(usuarios, 'revisor');

/**
 * Frentes (com o nome do catálogo) e turnos da ausência pela ordem do cadastro. Nomes por extenso:
 * subconsulta correlata.
 */
const frentesDaAusencia = sql<Referencia[]>`(
  select coalesce(json_agg(json_build_object('id', f.id, 'nome', ${ROTULO_DA_FRENTE_F}) order by ${ORDEM_DA_FRENTE_F}), '[]'::json)
  from ausencias_frentes af join frentes_escala f on f.id = af.frente_id ${CATALOGO_DA_FRENTE_F}
  where af.ausencia_id = "ausencias"."id"
)`;
const turnosDaAusencia = sql<Referencia[]>`(
  select coalesce(json_agg(json_build_object('id', t.id, 'nome', t.nome) order by t.ordem, t.nome), '[]'::json)
  from ausencias_turnos at join turnos t on t.id = at.turno_id
  where at.ausencia_id = "ausencias"."id"
)`;

const selecao = {
  id: ausencias.id,
  medicoId: medicos.id,
  medicoNome: medicos.nome,
  tipoId: tiposAusencia.id,
  tipoNome: tiposAusencia.nome,
  tipoCor: tiposAusencia.cor,
  dataInicio: ausencias.dataInicio,
  dataFim: ausencias.dataFim,
  diasSemana: ausencias.diasSemana,
  frentes: frentesDaAusencia,
  turnos: turnosDaAusencia,
  situacao: ausencias.situacao,
  origem: ausencias.origem,
  observacoes: ausencias.observacoes,
  motivoRecusa: ausencias.motivoRecusa,
  solicitadaPorId: solicitante.id,
  solicitadaPorNome: solicitante.nome,
  revisadaPorId: revisor.id,
  revisadaPorNome: revisor.nome,
  revisadaEm: ausencias.revisadaEm,
  criadoEm: ausencias.criadoEm,
};

/** A consulta base da leitura: a ausência com médico, tipo, solicitante e revisor. */
function consultaBase(db: Database) {
  return db
    .select(selecao)
    .from(ausencias)
    .innerJoin(medicos, eq(medicos.id, ausencias.medicoId))
    .innerJoin(tiposAusencia, eq(tiposAusencia.id, ausencias.tipoId))
    .leftJoin(solicitante, eq(solicitante.id, ausencias.solicitadaPorId))
    .leftJoin(revisor, eq(revisor.id, ausencias.revisadaPorId));
}

type Linha = Awaited<ReturnType<typeof consultaBase>>[number];

const referencia = (id: string | null, nome: string | null) =>
  id && nome !== null ? { id, nome } : null;

function detalhar(l: Linha): AusenciaDetalhada {
  return {
    id: l.id,
    medico: { id: l.medicoId, nome: l.medicoNome },
    tipo: { id: l.tipoId, nome: l.tipoNome, cor: l.tipoCor },
    dataInicio: l.dataInicio,
    dataFim: l.dataFim,
    diasSemana: l.diasSemana,
    frentes: l.frentes,
    turnos: l.turnos,
    situacao: l.situacao,
    origem: l.origem,
    observacoes: l.observacoes,
    motivoRecusa: l.motivoRecusa,
    solicitadaPor: referencia(l.solicitadaPorId, l.solicitadaPorNome),
    revisadaPor: referencia(l.revisadaPorId, l.revisadaPorNome),
    revisadaEm: l.revisadaEm,
    criadoEm: l.criadoEm,
  };
}

/**
 * O médico da ausência tem alguma alocação vigente no período dela dentro do recorte (turno OU
 * frente; mesma regra de `estaNoEscopo`). Sem recorte, nenhuma condição.
 */
function noEscopo(escopo: EscopoEscala | null): SQL | undefined {
  if (!escopo) return undefined;
  const turnoIds = [...escopo.turnoIds];
  const frenteIds = [...escopo.frenteIds];
  const alvos = [
    turnoIds.length ? inArray(alocacoes.turnoId, turnoIds) : undefined,
    frenteIds.length ? inArray(alocacoes.frenteId, frenteIds) : undefined,
  ].filter(Boolean) as SQL[];
  if (!alvos.length) return sql`false`;
  return sql`exists (select 1 from ${alocacoes} where ${and(
    eq(alocacoes.medicoId, ausencias.medicoId),
    lte(alocacoes.dataInicio, ausencias.dataFim),
    or(isNull(alocacoes.dataFim), gte(alocacoes.dataFim, ausencias.dataInicio)),
    or(...alvos),
  )})`;
}

const ordem = [
  desc(sql`${ausencias.situacao} = 'pendente'`),
  desc(ausencias.dataInicio),
  asc(ausencias.id),
];

@Injectable()
export class DrizzleAusenciasRepository implements AusenciasRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private consulta() {
    return consultaBase(this.db);
  }

  async listar(filtro: FiltroAusencias) {
    const onde = and(
      gte(ausencias.dataFim, filtro.de),
      filtro.ate ? lte(ausencias.dataInicio, filtro.ate) : undefined,
      filtro.situacao ? eq(ausencias.situacao, filtro.situacao) : undefined,
      filtro.tipoId ? eq(ausencias.tipoId, filtro.tipoId) : undefined,
      filtro.medicoId ? eq(ausencias.medicoId, filtro.medicoId) : undefined,
      filtro.busca ? ilike(medicos.nome, contem(filtro.busca)) : undefined,
      filtro.frenteId
        ? sql`(not exists (select 1 from ${ausenciasFrentes} where ${eq(ausenciasFrentes.ausenciaId, ausencias.id)})
            or exists (select 1 from ${ausenciasFrentes} where ${and(
              eq(ausenciasFrentes.ausenciaId, ausencias.id),
              eq(ausenciasFrentes.frenteId, filtro.frenteId),
            )}))`
        : undefined,
      noEscopo(filtro.escopo),
    );
    const [linhas, [total]] = await Promise.all([
      this.consulta()
        .where(onde)
        .orderBy(...ordem)
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db
        .select({ total: count() })
        .from(ausencias)
        .innerJoin(medicos, eq(medicos.id, ausencias.medicoId))
        .where(onde),
    ]);
    return { itens: linhas.map(detalhar), total: total?.total ?? 0 };
  }

  async buscar(id: string) {
    const [linha] = await this.consulta().where(eq(ausencias.id, id)).limit(1);
    return linha ? detalhar(linha) : null;
  }

  async contarPendentes(escopo: EscopoEscala | null) {
    const [linha] = await this.db
      .select({ total: count() })
      .from(ausencias)
      .where(and(eq(ausencias.situacao, 'pendente'), noEscopo(escopo)));
    return linha?.total ?? 0;
  }

  async doMedico(medicoId: string, limite: number) {
    const linhas = await this.consulta()
      .where(eq(ausencias.medicoId, medicoId))
      .orderBy(desc(ausencias.dataInicio), desc(ausencias.criadoEm))
      .limit(limite);
    return linhas.map(detalhar);
  }

  async tipo(id: string) {
    const [tipo] = await this.db
      .select({
        id: tiposAusencia.id,
        soGestor: tiposAusencia.soGestor,
        ativo: tiposAusencia.ativo,
      })
      .from(tiposAusencia)
      .where(eq(tiposAusencia.id, id))
      .limit(1);
    return tipo ?? null;
  }

  async medicosExistentes(ids: string[]) {
    if (!ids.length) return [];
    const linhas = await this.db
      .select({ id: medicos.id })
      .from(medicos)
      .where(inArray(medicos.id, ids));
    return linhas.map((l) => l.id);
  }

  async frentesExistentes(ids: string[]) {
    if (!ids.length) return [];
    const linhas = await this.db
      .select({ id: frentesEscala.id })
      .from(frentesEscala)
      .where(inArray(frentesEscala.id, ids));
    return linhas.map((l) => l.id);
  }

  async turnosExistentes(ids: string[]) {
    if (!ids.length) return [];
    const linhas = await this.db
      .select({ id: turnos.id })
      .from(turnos)
      .where(inArray(turnos.id, ids));
    return linhas.map((l) => l.id);
  }

  async alocacoesVigentes(medicoIds: string[], dataInicio: string, dataFim: string) {
    if (!medicoIds.length) return [];
    return this.db
      .selectDistinct({
        medicoId: alocacoes.medicoId,
        turnoId: alocacoes.turnoId,
        frenteId: alocacoes.frenteId,
      })
      .from(alocacoes)
      .where(
        and(
          inArray(alocacoes.medicoId, medicoIds),
          lte(alocacoes.dataInicio, dataFim),
          or(isNull(alocacoes.dataFim), gte(alocacoes.dataFim, dataInicio)),
        ),
      );
  }

  async medicoDoUsuario(usuarioId: string) {
    const [linha] = await this.db
      .select({ medicoId: usuarios.medicoId })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);
    return linha?.medicoId ?? null;
  }

  async criar(novas: NovaAusencia[], eventos: EventoAuditoria[]) {
    if (!novas.length) return;
    await this.db.transaction(async (tx) => {
      await tx.insert(ausencias).values(
        novas.map((n) => ({
          id: n.id,
          medicoId: n.medicoId,
          tipoId: n.tipoId,
          dataInicio: n.dataInicio,
          dataFim: n.dataFim,
          diasSemana: n.diasSemana,
          situacao: n.situacao,
          origem: n.origem,
          observacoes: n.observacoes,
          solicitadaPorId: n.solicitadaPorId,
        })),
      );
      for (const n of novas) await gravarRecortes(tx, n.id, n);
      await registrar(tx, eventos);
    });
  }

  async atualizar(id: string, dados: DadosAusenciaGravada, evento: EventoAuditoria) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(ausencias)
        .set({
          tipoId: dados.tipoId,
          dataInicio: dados.dataInicio,
          dataFim: dados.dataFim,
          diasSemana: dados.diasSemana,
          observacoes: dados.observacoes,
        })
        .where(eq(ausencias.id, id));
      await tx.delete(ausenciasFrentes).where(eq(ausenciasFrentes.ausenciaId, id));
      await tx.delete(ausenciasTurnos).where(eq(ausenciasTurnos.ausenciaId, id));
      await gravarRecortes(tx, id, dados);
      await registrar(tx, [evento]);
    });
  }

  async revisar(id: string, revisao: RevisaoGravada, evento: EventoAuditoria) {
    return this.db.transaction(async (tx) => {
      const alteradas = await tx
        .update(ausencias)
        .set(revisao)
        .where(and(eq(ausencias.id, id), eq(ausencias.situacao, 'pendente')))
        .returning({ id: ausencias.id });
      if (!alteradas.length) return false;
      await registrar(tx, [evento]);
      return true;
    });
  }

  async excluir(id: string, evento: EventoAuditoria, opcoes?: { somentePendente?: boolean }) {
    return this.db.transaction(async (tx) => {
      const apagadas = await tx
        .delete(ausencias)
        .where(
          and(
            eq(ausencias.id, id),
            opcoes?.somentePendente ? eq(ausencias.situacao, 'pendente') : undefined,
          ),
        )
        .returning({ id: ausencias.id });
      if (!apagadas.length) return false;
      await registrar(tx, [evento]);
      return true;
    });
  }
}

async function gravarRecortes(
  tx: Transacao,
  ausenciaId: string,
  dados: { frenteIds: string[]; turnoIds: string[] },
) {
  if (dados.frenteIds.length) {
    await tx
      .insert(ausenciasFrentes)
      .values(dados.frenteIds.map((frenteId) => ({ ausenciaId, frenteId })));
  }
  if (dados.turnoIds.length) {
    await tx
      .insert(ausenciasTurnos)
      .values(dados.turnoIds.map((turnoId) => ({ ausenciaId, turnoId })));
  }
}

/** Mesmo formato do `DrizzleAuditoria`, dentro da transação da escrita. */
async function registrar(tx: Transacao, eventos: EventoAuditoria[]) {
  if (!eventos.length) return;
  await tx.insert(eventosAuditoria).values(
    eventos.map((e) => ({
      ocorridoEm: e.em,
      atorTipo: e.ator.tipo,
      atorId: e.ator.id ?? null,
      entidade: e.entidade,
      entidadeId: e.entidadeId,
      acao: e.acao,
      antes: e.antes ?? null,
      depois: e.depois ?? null,
    })),
  );
}
