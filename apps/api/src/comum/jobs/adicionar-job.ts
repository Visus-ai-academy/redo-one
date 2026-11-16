import { type SQL, sql } from 'drizzle-orm';

/** Qualquer coisa que execute SQL: o `db` do Drizzle ou o `tx` de uma transação. */
export interface ExecutorSql {
  execute(query: SQL): Promise<unknown>;
}

export interface OpcoesJob {
  /**
   * Chave única: enfileirar de novo com a mesma chave substitui o job pendente em vez de criar
   * outro (ex.: `convite:<usuarioId>` evita dois e-mails de convite na fila).
   */
  chave?: string;
  /** Quando rodar; sem isso, roda assim que houver trabalhador livre. */
  executarEm?: Date;
  /** Padrão do graphile-worker: 25 tentativas com espera crescente. */
  maxTentativas?: number;
  /** Jobs da mesma fila rodam um de cada vez, na ordem (ex.: uma importação por vez). */
  fila?: string;
}

/**
 * Enfileira um job pelo SQL do graphile-worker. Passando o `tx` de uma transação, o job só passa a
 * existir se a transação confirmar: o dado e a tarefa entram juntos ou não entram.
 */
export async function adicionarJob(
  executor: ExecutorSql,
  tarefa: string,
  payload: unknown,
  opcoes: OpcoesJob = {},
): Promise<void> {
  await executor.execute(sql`
    select graphile_worker.add_job(
      ${tarefa},
      ${JSON.stringify(payload)}::json,
      queue_name => ${opcoes.fila ?? null}::text,
      run_at => ${opcoes.executarEm?.toISOString() ?? null}::timestamptz,
      max_attempts => ${opcoes.maxTentativas ?? null}::int,
      job_key => ${opcoes.chave ?? null}::text
    )
  `);
}
