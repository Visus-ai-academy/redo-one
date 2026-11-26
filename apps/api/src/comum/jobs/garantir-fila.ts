import { runMigrations } from 'graphile-worker';
import type { Pool } from 'pg';

/**
 * Cria (ou atualiza) o schema `graphile_worker`. O trabalhador faz isso ao subir; um comando
 * avulso que enfileira jobs (a carga do dashboards-one) chama antes, porque num banco recém-criado
 * a API pode nunca ter subido. Idempotente.
 */
export async function garantirFilaJobs(pool: Pool): Promise<void> {
  await runMigrations({ pgPool: pool });
}
