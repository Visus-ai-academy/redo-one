import type { Pool } from 'pg';

/** Chave da trava consultiva que só o processo com o trabalhador da fila segura. */
const TRAVA_TRABALHADOR = 724_190_001;

export interface SessaoTrabalho {
  /** Workers mortos cujas travas (de job e de fila serial) foram liberadas. */
  liberados: string[];
  /** Solta a trava consultiva (no desligamento do trabalhador). */
  encerrar(): Promise<void>;
}

/**
 * O graphile-worker só solta sozinho a trava de um worker que morreu no meio do job (API
 * reiniciada, processo derrubado) depois de 4 horas; até lá, a fila serial daquele job (leitura
 * da fila, importação, rodada) fica parada. Para soltar antes, a biblioteca oferece o
 * `force_unlock_workers`, que só pode ser usado com workers que de fato morreram.
 *
 * Para saber disso, o processo do trabalhador segura uma trava consultiva do Postgres numa
 * conexão própria enquanto vive: o Postgres a solta quando a conexão cai. Quem consegue a trava
 * (antes de subir os próprios workers) é o único trabalhador vivo, então toda trava que sobrou é
 * de worker morto e é liberada. Sem conseguir, há outro trabalhador vivo: devolve null e não toca
 * em nada, o que mantém a regra de um job por vez em cada fila.
 */
export async function assumirTrabalho(pool: Pool): Promise<SessaoTrabalho | null> {
  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [
      TRAVA_TRABALHADOR,
    ]);
    if (!rows[0]?.ok) {
      cliente.release();
      return null;
    }
    const travados = await cliente.query<{ locked_by: string }>(`
      select locked_by from graphile_worker._private_jobs where locked_by is not null
      union
      select locked_by from graphile_worker._private_job_queues where locked_by is not null
      order by 1`);
    const liberados = travados.rows.map((r) => r.locked_by);
    if (liberados.length) {
      await cliente.query('select graphile_worker.force_unlock_workers($1::text[])', [liberados]);
    }
    return {
      liberados,
      async encerrar() {
        try {
          await cliente.query('select pg_advisory_unlock($1)', [TRAVA_TRABALHADOR]);
        } finally {
          cliente.release();
        }
      },
    };
  } catch (erro) {
    // A conexão volta ao pool sem a trava: descarta, para não deixar a trava presa nela.
    cliente.release(true);
    throw erro;
  }
}
