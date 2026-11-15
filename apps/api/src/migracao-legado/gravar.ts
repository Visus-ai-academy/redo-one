import { eq, getTableColumns, inArray, type SQL, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import type { Database } from '../database/database';
import * as schema from '../database/schema';
import type { CatalogoMigrado } from './mapear-catalogo';
import type { MedicosMigrados } from './mapear-medicos';

/** Linhas por insert: fica longe do limite de parâmetros do Postgres. */
const LOTE = 300;

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

/** `coluna = excluded.coluna` para todas as colunas menos as da chave. */
function atualizarTudo(tabela: PgTable, chave: string[]): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const [prop, coluna] of Object.entries(getTableColumns(tabela))) {
    if (chave.includes(prop) || prop === 'criadoEm') continue;
    set[prop] = sql.raw(`excluded."${coluna.name}"`);
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
 * Grava o catálogo e os médicos migrados no banco do redo-one, numa transação só: ou entra tudo,
 * ou nada. A ordem respeita as chaves estrangeiras; as autorreferências (repasse do contratado,
 * principal do cliente) entram num segundo passo.
 */
export async function gravarMigracao(
  db: Database,
  { tabelas: c, removidos }: CatalogoMigrado,
  { tabelas: m }: MedicosMigrados,
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
  });
}
