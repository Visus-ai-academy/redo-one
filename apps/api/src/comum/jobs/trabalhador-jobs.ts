import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Runner, run } from 'graphile-worker';
import type { Pool } from 'pg';

import { PG_POOL } from '../../database/database';
import { comPrazo } from '../prazo';
import { RegistroTarefas } from './registro-tarefas';
import { assumirTrabalho, type SessaoTrabalho } from './travas-orfas';

/** Primeira espera para tentar assumir de novo depois de uma falha; dobra a cada falha seguida. */
export const RELIGAR_INICIAL_MS = 2_000;
/**
 * Teto da espera entre tentativas, e o intervalo com que um processo sem a trava (outro
 * trabalhador vivo) confere se ela ficou livre, para assumir quando o outro sair (ex.: deploy).
 */
export const RELIGAR_MAXIMO_MS = 60_000;
/** Prazo para o runner parar terminando os jobs em andamento antes de ser forçado. */
export const PRAZO_PARADA_MS = 20_000;
/** Prazo da parada forçada (falha os jobs em andamento; eles voltam à fila). */
export const PRAZO_KILL_MS = 10_000;

/**
 * Trabalhador da fila no mesmo processo da API. Sobe no bootstrap (depois de todos os módulos
 * registrarem as tarefas) só com `JOBS_WORKER=true`, e para no shutdown terminando o job atual.
 * Na primeira subida, o graphile-worker cria o schema `graphile_worker` no banco.
 *
 * Só roda os jobs quem segura a trava do trabalhador (ver `assumirTrabalho`), que antes libera as
 * travas que um processo anterior deixou ao morrer no meio de um job. Sem a trava, outro
 * trabalhador está vivo: este fica parado e confere de tempos em tempos se ela ficou livre.
 *
 * Se a conexão da trava cai (o banco solta a trava e outro processo pode assumir) ou o runner do
 * graphile-worker para sozinho, o trabalhador para tudo, solta a sessão e tenta assumir de novo,
 * com espera crescente. Parar e desligar têm prazo: com conexão morta, nada pendura.
 */
@Injectable()
export class TrabalhadorJobs implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(TrabalhadorJobs.name);
  private runner?: Runner;
  private sessao?: SessaoTrabalho;
  private desligando = false;
  private falhasSeguidas = 0;
  private proximaTentativa?: NodeJS.Timeout;
  private assumindo?: Promise<void>;
  private soltando?: Promise<void>;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly registro: RegistroTarefas,
    private readonly config: ConfigService,
  ) {}

  get rodando() {
    return this.runner !== undefined;
  }

  async onApplicationBootstrap() {
    if (this.config.get<string>('JOBS_WORKER') !== 'true') return;
    await this.tentarAssumir();
  }

  // Antes do onApplicationShutdown, que fecha o pool: parar o trabalhador ainda precisa do banco.
  async beforeApplicationShutdown() {
    this.desligando = true;
    clearTimeout(this.proximaTentativa);
    // Uma tentativa em andamento (ex.: conectando num banco fora) não segura o desligamento:
    // se terminar depois, ela mesma solta o que pegou.
    if (this.assumindo) {
      await comPrazo(this.assumindo, PRAZO_PARADA_MS, 'assumir o trabalho').catch(() => {});
    }
    await this.soltar();
  }

  private tentarAssumir(): Promise<void> {
    this.assumindo = this.assumir().finally(() => {
      this.assumindo = undefined;
    });
    return this.assumindo;
  }

  private async assumir() {
    if (this.desligando) return;
    let sessao: SessaoTrabalho | null;
    try {
      sessao = await assumirTrabalho(this.pool);
    } catch (erro) {
      this.logger.warn(`Fila de jobs: não deu para assumir o trabalho: ${(erro as Error).message}`);
      return this.agendar(this.esperaCrescente());
    }
    if (!sessao) {
      this.logger.warn('Outro trabalhador da fila está vivo: este processo não roda jobs.');
      return this.agendar(RELIGAR_MAXIMO_MS);
    }
    if (this.desligando) return sessao.encerrar();
    if (sessao.liberados.length) {
      this.logger.warn(
        `Travas de ${sessao.liberados.length} worker(s) morto(s) liberadas; os jobs voltam à fila.`,
      );
    }

    let runner: Runner;
    try {
      runner = await run({
        pgPool: this.pool,
        taskList: this.registro.listar(),
        crontab: this.registro.agenda(),
        concurrency: 2,
        noHandleSignals: true,
      });
    } catch (erro) {
      this.logger.warn(`Fila de jobs: o runner não subiu: ${(erro as Error).message}`);
      await sessao.encerrar();
      return this.agendar(this.esperaCrescente());
    }
    if (this.desligando) {
      await pararRunner(runner, this.logger);
      return sessao.encerrar();
    }
    this.sessao = sessao;
    this.runner = runner;
    this.falhasSeguidas = 0;
    this.logger.log(
      `Fila de jobs rodando (${Object.keys(this.registro.listar()).length} tarefas).`,
    );

    // Registrado antes da corrida abaixo: quando ela decide, o runner já consta como parado.
    void runner.promise.then(
      () => parados.add(runner),
      () => parados.add(runner),
    );
    const parouSozinho = runner.promise.then(
      () => 'o runner do graphile-worker parou sozinho',
      (erro: Error) => `o runner do graphile-worker parou com erro: ${erro.message}`,
    );
    void Promise.race([sessao.perdida, parouSozinho]).then((motivo) =>
      this.recuperar(runner, motivo),
    );
  }

  /** Algo caiu com o runner no ar: para tudo e tenta assumir de novo depois da espera. */
  private async recuperar(runner: Runner, motivo: string) {
    if (this.desligando || this.runner !== runner) return;
    this.logger.warn(`Fila de jobs parada (${motivo}); tentando assumir de novo.`);
    await this.soltar();
    if (!this.desligando) this.agendar(this.esperaCrescente());
  }

  /** Para o runner (com prazo) e solta a sessão; nunca pendura nem rejeita. */
  private soltar(): Promise<void> {
    const { runner, sessao } = this;
    this.runner = undefined;
    this.sessao = undefined;
    const anterior = this.soltando ?? Promise.resolve();
    this.soltando = anterior.then(async () => {
      if (runner) await pararRunner(runner, this.logger);
      await sessao?.encerrar();
    });
    return this.soltando;
  }

  private agendar(ms: number) {
    if (this.desligando) return;
    clearTimeout(this.proximaTentativa);
    this.proximaTentativa = setTimeout(() => void this.tentarAssumir(), ms);
    this.proximaTentativa.unref?.();
  }

  private esperaCrescente() {
    const ms = Math.min(RELIGAR_INICIAL_MS * 2 ** this.falhasSeguidas, RELIGAR_MAXIMO_MS);
    this.falhasSeguidas++;
    return ms;
  }
}

/** Runners que já terminaram (sozinhos ou parados): o `stop` deles recusa com erro. */
const parados = new WeakSet<Runner>();

/**
 * Para terminando os jobs em andamento; sem terminar no prazo (ex.: consulta presa numa conexão
 * morta), força a parada. Um runner que já parou sozinho não precisa de nada.
 */
async function pararRunner(runner: Runner, logger: Logger) {
  if (parados.has(runner)) return;
  try {
    await comPrazo(runner.stop(), PRAZO_PARADA_MS, 'parar o runner');
    return;
  } catch (erro) {
    logger.warn(`Fila de jobs: forçando a parada: ${(erro as Error).message}`);
  }
  try {
    await comPrazo(runner.kill(), PRAZO_KILL_MS, 'forçar a parada do runner');
  } catch (erro) {
    logger.warn(`Fila de jobs: a parada forçada não terminou: ${(erro as Error).message}`);
  }
}
