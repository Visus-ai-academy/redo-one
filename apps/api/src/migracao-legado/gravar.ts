import {
  and,
  eq,
  getTableColumns,
  getTableName,
  inArray,
  isNull,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { Database } from '../database/database';
import * as schema from '../database/schema';
import type { CatalogoMigrado } from './mapear-catalogo';
import type { EscalaMigrada } from './mapear-escala';
import type { MedicosMigrados } from './mapear-medicos';

/** Linhas por insert: fica longe do limite de parâmetros do Postgres. */
const LOTE = 300;

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * `coluna = excluded.coluna` para todas as colunas menos as da chave. A descrição é complemento:
 * vazia no dashboards-one, fica a que alguém preencheu no redo-one. A cor escolhida no redo-one
 * vale mais que a de lá (as cores foram refeitas aqui); a de lá só preenche a vazia.
 */
function atualizarTudo(tabela: PgTable, chave: string[]): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const [prop, coluna] of Object.entries(getTableColumns(tabela))) {
    if (chave.includes(prop) || prop === 'criadoEm') continue;
    const atual = `"${getTableName(tabela)}"."${coluna.name}"`;
    set[prop] =
      prop === 'cor'
        ? sql.raw(`coalesce(${atual}, excluded."${coluna.name}")`)
        : prop === 'descricao'
          ? sql.raw(`coalesce(excluded."${coluna.name}", ${atual})`)
          : sql.raw(`excluded."${coluna.name}"`);
  }
  return set;
}

/** Insere em lotes; a linha que já existe (mesmo id) é atualizada. Rodar de novo dá o mesmo. */
async function upsert<T extends PgTable>(
  tx: Transacao,
  tabela: T,
  linhas: T['$inferInsert'][],
  chave: string[] = ['id'],
) {
  const colunas = getTableColumns(tabela);
  const alvo = chave.map((c) => colunas[c]).filter((c) => c !== undefined);
  const set = atualizarTudo(tabela, chave);
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    const insert = tx.insert(tabela).values(lote as never);
    await (Object.keys(set).length > 0
      ? insert.onConflictDoUpdate({ target: alvo as never, set })
      : insert.onConflictDoNothing());
  }
}

/**
 * Grava o catálogo, os médicos e a escala migrados no banco do redo-one, numa transação só: ou
 * entra tudo, ou nada. A ordem respeita as chaves estrangeiras; as autorreferências (repasse do
 * contratado, principal do cliente, titular da cobertura) entram num segundo passo.
 */
export async function gravarMigracao(
  db: Database,
  { tabelas: c, removidos }: CatalogoMigrado,
  { tabelas: m }: MedicosMigrados,
  escala?: EscalaMigrada,
): Promise<void> {
  await db.transaction(async (tx) => {
    await upsert(tx, schema.modalidades, c.modalidades);
    await upsert(tx, schema.modalidadesDePara, c.modalidadesDePara, ['origem']);
    await upsert(tx, schema.especialidades, c.especialidades);
    await upsert(tx, schema.subespecialidades, c.subespecialidades);
    await upsert(tx, schema.subespecialidadesEspecialidades, c.subespecialidadesEspecialidades, [
      'subespecialidadeId',
      'especialidadeId',
    ]);
    await upsert(tx, schema.categoriasExame, c.categoriasExame);
    await upsert(tx, schema.prioridades, c.prioridades);
    await upsert(tx, schema.prioridadesDePara, c.prioridadesDePara);
    await upsert(tx, schema.especialidadesDePara, c.especialidadesDePara);
    await upsert(tx, schema.exames, c.exames);
    await upsert(tx, schema.quebrasEstudo, c.quebrasEstudo);
    await upsert(tx, schema.quebrasEstudoPecas, c.quebrasEstudoPecas);
    // Casa pela grafia: a linha que representa as repetidas pode mudar de uma carga para outra.
    await upsert(tx, schema.examesDeParaValores, c.examesDeParaValores, ['chaveNormalizada']);

    // O que uma carga anterior trouxe e esta não traz mais (MAMO, D.O, GERAL, frentes da escala,
    // OT): os exames já foram reapontados acima; sai o que ainda apontar para elas no catálogo.
    if (removidos.especialidades.length > 0) {
      await tx
        .delete(schema.subespecialidadesEspecialidades)
        .where(
          inArray(schema.subespecialidadesEspecialidades.especialidadeId, removidos.especialidades),
        );
      await tx
        .delete(schema.especialidadesDePara)
        .where(inArray(schema.especialidadesDePara.especialidadeId, removidos.especialidades));
      await tx
        .delete(schema.especialidades)
        .where(inArray(schema.especialidades.id, removidos.especialidades));
    }
    if (removidos.especialidadesDePara.length > 0) {
      await tx
        .delete(schema.especialidadesDePara)
        .where(inArray(schema.especialidadesDePara.id, removidos.especialidadesDePara));
    }
    if (removidos.modalidades.length > 0) {
      await tx
        .delete(schema.modalidades)
        .where(inArray(schema.modalidades.id, removidos.modalidades));
    }

    await upsert(
      tx,
      schema.contratados,
      c.contratados.map((ct) => ({ ...ct, contratadoRepasseId: null })),
    );
    for (const ct of c.contratados.filter((x) => x.contratadoRepasseId)) {
      await tx
        .update(schema.contratados)
        .set({ contratadoRepasseId: ct.contratadoRepasseId })
        .where(eq(schema.contratados.id, ct.id as string));
    }

    await upsert(
      tx,
      schema.clientes,
      c.clientes.map((cl) => ({ ...cl, unificadoEmId: null })),
    );
    for (const cl of c.clientes.filter((x) => x.unificadoEmId)) {
      await tx
        .update(schema.clientes)
        .set({ unificadoEmId: cl.unificadoEmId })
        .where(eq(schema.clientes.id, cl.id));
    }
    await upsert(tx, schema.clientesAliases, c.clientesAliases);
    await upsert(tx, schema.sufixosNomeCliente, c.sufixosNomeCliente);

    await upsert(tx, schema.medicos, m.medicos);
    await upsert(tx, schema.medicosDadosPagamento, m.medicosDadosPagamento, ['medicoId']);
    await upsert(tx, schema.medicosAliases, m.medicosAliases);
    await upsert(tx, schema.equipes, m.equipes);
    await upsert(tx, schema.equipesMembros, m.equipesMembros, ['equipeId', 'medicoId']);

    if (escala) await gravarEscala(tx, escala);
  });
}

/**
 * Escala. Os recortes (frentes do turno, prioridades e subespecialidades da alocação, frentes e
 * turnos da ausência, escopo da gestora) são trocados inteiros para os registros que a carga
 * traz: o dashboards-one é a fonte da verdade, e assim rodar de novo dá o mesmo resultado.
 */
async function gravarEscala(tx: Transacao, { tabelas: migradas }: EscalaMigrada) {
  const e = remapearFrentes(migradas, await gravarFrentes(tx, migradas.frentesEscala));
  const trocar = async <T extends PgTable>(
    tabela: T,
    coluna: AnyPgColumn,
    donos: string[],
    linhas: T['$inferInsert'][],
    chave: string[],
  ) => {
    if (donos.length > 0) await tx.delete(tabela).where(inArray(coluna, donos));
    await upsert(tx, tabela, linhas, chave);
  };

  await upsert(tx, schema.turnos, e.turnos);
  await trocar(
    schema.turnosFrentes,
    schema.turnosFrentes.turnoId,
    e.turnos.map((t) => t.id),
    e.turnosFrentes,
    ['turnoId', 'frenteId'],
  );

  await upsert(
    tx,
    schema.alocacoes,
    e.alocacoes.map((a) => ({ ...a, coberturaDeId: null })),
  );
  for (const a of e.alocacoes.filter((x) => x.coberturaDeId)) {
    await tx
      .update(schema.alocacoes)
      .set({ coberturaDeId: a.coberturaDeId })
      .where(eq(schema.alocacoes.id, a.id));
  }
  const alocacaoIds = e.alocacoes.map((a) => a.id);
  await trocar(
    schema.alocacoesPrioridades,
    schema.alocacoesPrioridades.alocacaoId,
    alocacaoIds,
    e.alocacoesPrioridades,
    ['alocacaoId', 'prioridadeId'],
  );
  await trocar(
    schema.alocacoesSubespecialidades,
    schema.alocacoesSubespecialidades.alocacaoId,
    alocacaoIds,
    e.alocacoesSubespecialidades,
    ['alocacaoId', 'subespecialidadeId'],
  );
  // Casa pela alocação e o dia: a tela pode já ter criado o ajuste com outro id. Vale o do
  // dashboards-one, inclusive o id (é o que o histórico migrado cita).
  await upsert(tx, schema.ajustesProdutividade, e.ajustesProdutividade, ['alocacaoId', 'data']);

  // Tipos de ausência são cadastro editável: a carga só cria o que falta e não sobrescreve.
  // Se já houver um tipo com o mesmo nome (semeado por outro caminho), a ausência usa esse.
  if (e.tiposAusencia.length > 0)
    await tx.insert(schema.tiposAusencia).values(e.tiposAusencia).onConflictDoNothing();
  // A cor é a única coisa que a carga completa num tipo existente, e só se ele não tiver nenhuma.
  for (const tipo of e.tiposAusencia)
    if (tipo.cor)
      await tx
        .update(schema.tiposAusencia)
        .set({ cor: tipo.cor })
        .where(and(eq(schema.tiposAusencia.nome, tipo.nome), isNull(schema.tiposAusencia.cor)));
  const existentes = await tx
    .select({ id: schema.tiposAusencia.id, nome: schema.tiposAusencia.nome })
    .from(schema.tiposAusencia);
  const idsExistentes = new Set(existentes.map((t) => t.id));
  const porNome = new Map(existentes.map((t) => [t.nome, t.id]));
  const tipoFinal = new Map(
    e.tiposAusencia.map((t) => [
      t.id,
      idsExistentes.has(t.id) ? t.id : (porNome.get(t.nome) ?? t.id),
    ]),
  );
  await upsert(
    tx,
    schema.ausencias,
    e.ausencias.map((a) => ({ ...a, tipoId: tipoFinal.get(a.tipoId) ?? a.tipoId })),
  );
  const ausenciaIds = e.ausencias.map((a) => a.id);
  await trocar(
    schema.ausenciasFrentes,
    schema.ausenciasFrentes.ausenciaId,
    ausenciaIds,
    e.ausenciasFrentes,
    ['ausenciaId', 'frenteId'],
  );
  await trocar(
    schema.ausenciasTurnos,
    schema.ausenciasTurnos.ausenciaId,
    ausenciaIds,
    e.ausenciasTurnos,
    ['ausenciaId', 'turnoId'],
  );

  await trocar(
    schema.usuariosEscoposEscala,
    schema.usuariosEscoposEscala.usuarioId,
    [...new Set(e.usuariosEscoposEscala.map((u) => u.usuarioId))],
    e.usuariosEscoposEscala,
    ['id'],
  );
  await upsert(tx, schema.eventosAuditoria, e.eventosAuditoria);
}

type Frentes = EscalaMigrada['tabelas']['frentesEscala'];

/**
 * Grava as frentes e devolve id da carga → id que vale no banco. A frente pode já existir com
 * outro id (a tela cria a da especialidade ou modalidade ao gravar um turno): aí fica a que já
 * existe, e a carga passa a apontar para ela.
 */
async function gravarFrentes(tx: Transacao, frentes: Frentes): Promise<Map<string, string>> {
  if (frentes.length === 0) return new Map();
  await tx.insert(schema.frentesEscala).values(frentes).onConflictDoNothing();
  const f = schema.frentesEscala;
  const especialidadeIds = frentes.flatMap((x) => (x.especialidadeId ? [x.especialidadeId] : []));
  const modalidadeIds = frentes.flatMap((x) => (x.modalidadeId ? [x.modalidadeId] : []));
  const gravadas = await tx
    .select({ id: f.id, especialidadeId: f.especialidadeId, modalidadeId: f.modalidadeId })
    .from(f)
    .where(
      or(
        especialidadeIds.length ? inArray(f.especialidadeId, especialidadeIds) : undefined,
        modalidadeIds.length ? inArray(f.modalidadeId, modalidadeIds) : undefined,
      ),
    );
  const destino = (x: { especialidadeId?: string | null; modalidadeId?: string | null }) =>
    x.especialidadeId ? `e:${x.especialidadeId}` : `m:${x.modalidadeId}`;
  const real = new Map(gravadas.map((g) => [destino(g), g.id]));
  return new Map(frentes.map((x) => [x.id, real.get(destino(x)) ?? x.id]));
}

/** Troca, em tudo que a carga grava, o id da frente pelo que vale no banco. */
function remapearFrentes(
  e: EscalaMigrada['tabelas'],
  ids: Map<string, string>,
): EscalaMigrada['tabelas'] {
  if ([...ids].every(([de, para]) => de === para)) return e;
  const id = <T extends string | null | undefined>(v: T): T =>
    (typeof v === 'string' ? (ids.get(v) ?? v) : v) as T;
  const json = <T>(v: T): T =>
    v === null || v === undefined
      ? v
      : (JSON.parse(JSON.stringify(v), (_, x) => (typeof x === 'string' ? id(x) : x)) as T);
  return {
    ...e,
    turnosFrentes: e.turnosFrentes.map((x) => ({ ...x, frenteId: id(x.frenteId) })),
    alocacoes: e.alocacoes.map((x) => ({ ...x, frenteId: id(x.frenteId) })),
    ausenciasFrentes: e.ausenciasFrentes.map((x) => ({ ...x, frenteId: id(x.frenteId) })),
    usuariosEscoposEscala: e.usuariosEscoposEscala.map((x) => ({
      ...x,
      frenteId: id(x.frenteId),
    })),
    eventosAuditoria: e.eventosAuditoria.map((x) => ({
      ...x,
      entidadeId: id(x.entidadeId),
      antes: json(x.antes),
      depois: json(x.depois),
    })),
  };
}
