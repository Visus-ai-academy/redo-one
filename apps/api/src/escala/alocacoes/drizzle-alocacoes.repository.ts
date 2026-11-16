import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { EventoAuditoria } from '../../auditoria/auditoria';
import { DATABASE, type Database } from '../../database/database';
import {
  ajustesProdutividade,
  alocacoes,
  alocacoesPrioridades,
  alocacoesSubespecialidades,
  eventosAuditoria,
  medicos,
  prioridades,
  subespecialidades,
  turnos,
} from '../../database/schema';
import type {
  AjusteGravado,
  AlocacaoGravada,
  AlocacoesRepository,
  TurnoParaAlocar,
} from './alocacoes.repository';

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Ids do recorte como `text[]`. Nomes por extenso: numa tabela só o Drizzle omite a tabela. */
const recorte = (tabela: string, coluna: string) =>
  sql<string[]>`array(
    select r.${sql.raw(coluna)}::text from ${sql.raw(tabela)} r
    where r.alocacao_id = "alocacoes"."id" order by 1
  )`;

const selecao = {
  id: alocacoes.id,
  medicoId: alocacoes.medicoId,
  turnoId: alocacoes.turnoId,
  frenteId: alocacoes.frenteId,
  diasSemana: alocacoes.diasSemana,
  semanasDoMes: alocacoes.semanasDoMes,
  horarioInicio: alocacoes.horarioInicio,
  horarioFim: alocacoes.horarioFim,
  dataInicio: alocacoes.dataInicio,
  dataFim: alocacoes.dataFim,
  produtividade: alocacoes.produtividade,
  gratificado: alocacoes.gratificado,
  subespecialidadeGeral: alocacoes.subespecialidadeGeral,
  prioridadeIds: recorte('alocacoes_prioridades', 'prioridade_id'),
  subespecialidadeIds: recorte('alocacoes_subespecialidades', 'subespecialidade_id'),
  coberturaDeId: alocacoes.coberturaDeId,
  observacoes: alocacoes.observacoes,
};

const selecaoAjuste = {
  id: ajustesProdutividade.id,
  alocacaoId: ajustesProdutividade.alocacaoId,
  data: ajustesProdutividade.data,
  produtividade: ajustesProdutividade.produtividade,
  observacoes: ajustesProdutividade.observacoes,
};

@Injectable()
export class DrizzleAlocacoesRepository implements AlocacoesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async buscar(id: string): Promise<AlocacaoGravada | null> {
    const [linha] = await this.db.select(selecao).from(alocacoes).where(eq(alocacoes.id, id));
    return linha ?? null;
  }

  coberturasDe(titularId: string): Promise<AlocacaoGravada[]> {
    return this.db
      .select(selecao)
      .from(alocacoes)
      .where(eq(alocacoes.coberturaDeId, titularId))
      .orderBy(alocacoes.dataInicio);
  }

  async turno(id: string): Promise<TurnoParaAlocar | null> {
    const [linha] = await this.db
      .select({
        id: turnos.id,
        nome: turnos.nome,
        tipo: turnos.tipo,
        horarioInicio: turnos.horarioInicio,
        horarioFim: turnos.horarioFim,
        frenteIds: sql<string[]>`array(
          select tf.frente_id::text from turnos_frentes tf where tf.turno_id = "turnos"."id"
        )`,
      })
      .from(turnos)
      .where(eq(turnos.id, id));
    return linha ?? null;
  }

  async medico(id: string) {
    const [linha] = await this.db
      .select({ ativo: medicos.ativo })
      .from(medicos)
      .where(eq(medicos.id, id));
    return linha ?? null;
  }

  async prioridadesExistentes(ids: string[]) {
    if (!ids.length) return [];
    const linhas = await this.db
      .select({ id: prioridades.id })
      .from(prioridades)
      .where(inArray(prioridades.id, ids));
    return linhas.map((l) => l.id);
  }

  async subespecialidadesExistentes(ids: string[]) {
    if (!ids.length) return [];
    const linhas = await this.db
      .select({ id: subespecialidades.id })
      .from(subespecialidades)
      .where(inArray(subespecialidades.id, ids));
    return linhas.map((l) => l.id);
  }

  async ajuste(alocacaoId: string, data: string) {
    const [linha] = await this.db
      .select(selecaoAjuste)
      .from(ajustesProdutividade)
      .where(
        and(eq(ajustesProdutividade.alocacaoId, alocacaoId), eq(ajustesProdutividade.data, data)),
      );
    return linha ?? null;
  }

  async ajustesDe(alocacaoIds: string[]) {
    if (!alocacaoIds.length) return [];
    return this.db
      .select(selecaoAjuste)
      .from(ajustesProdutividade)
      .where(inArray(ajustesProdutividade.alocacaoId, alocacaoIds))
      .orderBy(ajustesProdutividade.data);
  }

  async criar(alocacao: AlocacaoGravada, eventos: EventoAuditoria[]) {
    const { prioridadeIds, subespecialidadeIds, ...campos } = alocacao;
    await this.db.transaction(async (tx) => {
      await tx.insert(alocacoes).values(campos);
      await gravarRecortes(tx, alocacao);
      await gravarEventos(tx, eventos);
    });
  }

  async atualizar(alocacao: AlocacaoGravada, eventos: EventoAuditoria[]) {
    const { id, prioridadeIds, subespecialidadeIds, ...campos } = alocacao;
    await this.db.transaction(async (tx) => {
      await tx.update(alocacoes).set(campos).where(eq(alocacoes.id, id));
      await tx.delete(alocacoesPrioridades).where(eq(alocacoesPrioridades.alocacaoId, id));
      await tx
        .delete(alocacoesSubespecialidades)
        .where(eq(alocacoesSubespecialidades.alocacaoId, id));
      await gravarRecortes(tx, alocacao);
      await gravarEventos(tx, eventos);
    });
  }

  async remover(id: string, eventos: EventoAuditoria[]) {
    await this.db.transaction(async (tx) => {
      await tx.delete(alocacoes).where(eq(alocacoes.id, id));
      await gravarEventos(tx, eventos);
    });
  }

  async salvarAjuste(ajuste: AjusteGravado, eventos: EventoAuditoria[]) {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(ajustesProdutividade)
        .values(ajuste)
        .onConflictDoUpdate({
          target: [ajustesProdutividade.alocacaoId, ajustesProdutividade.data],
          set: { produtividade: ajuste.produtividade, observacoes: ajuste.observacoes },
        });
      await gravarEventos(tx, eventos);
    });
  }

  async removerAjuste(id: string, eventos: EventoAuditoria[]) {
    await this.db.transaction(async (tx) => {
      await tx.delete(ajustesProdutividade).where(eq(ajustesProdutividade.id, id));
      await gravarEventos(tx, eventos);
    });
  }
}

async function gravarRecortes(tx: Transacao, alocacao: AlocacaoGravada) {
  if (alocacao.prioridadeIds.length) {
    await tx
      .insert(alocacoesPrioridades)
      .values(
        alocacao.prioridadeIds.map((prioridadeId) => ({ alocacaoId: alocacao.id, prioridadeId })),
      );
  }
  if (alocacao.subespecialidadeIds.length) {
    await tx.insert(alocacoesSubespecialidades).values(
      alocacao.subespecialidadeIds.map((subespecialidadeId) => ({
        alocacaoId: alocacao.id,
        subespecialidadeId,
      })),
    );
  }
}

/** Os eventos de auditoria na mesma transação do dado (o `DrizzleAuditoria` grava fora dela). */
async function gravarEventos(tx: Transacao, eventos: EventoAuditoria[]) {
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
