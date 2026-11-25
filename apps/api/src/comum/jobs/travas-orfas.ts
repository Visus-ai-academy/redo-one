import type { Pool, PoolClient } from 'pg';

import { comPrazo } from '../prazo';

/** Chave da trava consultiva que só o processo com o trabalhador da fila segura. */
const TRAVA_TRABALHADOR = 724_190_001;

/**
 * De quanto em quanto tempo a sessão confere no banco que ainda segura a trava. A queda da
 * conexão costuma chegar pelo `error`/`end` do cliente, mas uma conexão meio aberta (a rede caiu
 * sem avisar) não emite nada: só uma consulta revela. Consulta leve, numa conexão já aberta.
 */
export const VERIFICACAO_TRAVA_MS = 30_000;
/** Prazo de cada consulta na conexão da trava; sem resposta nele, a conexão é tida como morta. */
export const PRAZO_CONSULTA_MS = 10_000;

export interface SessaoTrabalho {
  /** Workers mortos cujas travas (de job e de fila serial) foram liberadas. */
  liberados: string[];
  /**
   * Resolve (nunca rejeita) com o motivo quando a trava se perde: a conexão deu erro, terminou
   * ou a conferência periódica falhou. O banco solta a trava quando a conexão cai, e outro
   * processo pode assumir: quem a perdeu precisa parar o trabalhador.
   */
  perdida: Promise<string>;
  /**
   * Solta a trava e devolve a conexão. Nunca pendura nem rejeita: com a conexão morta ou sem
   * resposta no prazo, descarta a conexão (o banco solta a trava quando ela cai).
   */
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
    return vigiar(cliente, liberados);
  } catch (erro) {
    // A conexão volta ao pool sem a trava: descarta, para não deixar a trava presa nela.
    cliente.release(true);
    throw erro;
  }
}

/** Vigia a conexão da trava e devolve a sessão (ver `SessaoTrabalho`). */
function vigiar(cliente: PoolClient, liberados: string[]): SessaoTrabalho {
  let avisar: (motivo: string) => void = () => {};
  const perdida = new Promise<string>((resolver) => {
    avisar = resolver;
  });
  let morta = false;
  const perder = (motivo: string) => {
    morta = true;
    avisar(motivo);
  };
  const aoErro = (erro: Error) => perder(`a conexão da trava caiu: ${erro.message}`);
  const aoFim = () => perder('a conexão da trava terminou');
  cliente.on('error', aoErro);
  cliente.on('end', aoFim);

  const conferir = async () => {
    try {
      const { rows } = await comPrazo(
        cliente.query<{ ok: boolean }>(
          `select exists (select 1 from pg_locks where locktype = 'advisory' and objid = $1
             and pid = pg_backend_pid() and granted) as ok`,
          [TRAVA_TRABALHADOR],
        ),
        PRAZO_CONSULTA_MS,
        'conferência da trava',
      );
      if (!rows[0]?.ok) perder('o banco não registra mais a trava');
    } catch (erro) {
      perder(`a conferência da trava falhou: ${(erro as Error).message}`);
    }
  };
  let conferindo = false;
  const intervalo = setInterval(() => {
    if (conferindo || morta) return;
    conferindo = true;
    void conferir().finally(() => {
      conferindo = false;
    });
  }, VERIFICACAO_TRAVA_MS);
  intervalo.unref?.();

  let encerrada: Promise<void> | undefined;
  return {
    liberados,
    perdida,
    encerrar() {
      encerrada ??= (async () => {
        clearInterval(intervalo);
        let falha: Error | undefined;
        if (morta) falha = new Error('conexão da trava morta');
        else {
          try {
            await comPrazo(
              cliente.query('select pg_advisory_unlock($1)', [TRAVA_TRABALHADOR]),
              PRAZO_CONSULTA_MS,
              'soltar a trava',
            );
          } catch (erro) {
            falha = erro as Error;
          }
        }
        cliente.off('end', aoFim);
        // Com erro, o pool descarta (e fecha) a conexão em vez de reaproveitá-la. O ouvinte de
        // `error` fica: o fechamento de uma conexão morta ainda pode emitir erro.
        cliente.release(falha);
      })();
      return encerrada;
    },
  };
}
