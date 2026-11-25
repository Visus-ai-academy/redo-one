import type { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RegistroTarefas } from './registro-tarefas';
import {
  PRAZO_KILL_MS,
  PRAZO_PARADA_MS,
  RELIGAR_INICIAL_MS,
  RELIGAR_MAXIMO_MS,
  TrabalhadorJobs,
} from './trabalhador-jobs';

const ordem: string[] = [];

function adiado<T>() {
  let resolver!: (valor: T) => void;
  let rejeitar!: (erro: unknown) => void;
  const promessa = new Promise<T>((res, rej) => {
    resolver = res;
    rejeitar = rej;
  });
  return { promessa, resolver, rejeitar };
}

/** Sessão de mentira: `perder` simula a queda da conexão que segura a trava. */
function novaSessao() {
  const perda = adiado<string>();
  return {
    liberados: [] as string[],
    perdida: perda.promessa,
    perder: perda.resolver,
    encerrar: vi.fn(async () => {
      ordem.push('encerrar');
    }),
  };
}
type Sessao = ReturnType<typeof novaSessao>;

/** Runner de mentira do graphile-worker: `morrer` simula o runner parar sozinho. */
function novoRunner() {
  const fim = adiado<void>();
  const runner = {
    promise: fim.promessa,
    morrer: (erro?: Error) => (erro ? fim.rejeitar(erro) : fim.resolver()),
    travar: false,
    stop: vi.fn(async () => {
      ordem.push('stop');
      if (runner.travar) return new Promise<void>(() => {});
      fim.resolver();
    }),
    kill: vi.fn(async () => {
      ordem.push('kill');
      fim.resolver();
    }),
  };
  return runner;
}
type RunnerFalso = ReturnType<typeof novoRunner>;

/** O que cada `assumirTrabalho` devolve, na ordem; `Error` vira falha (banco fora). */
let respostas: Array<Sessao | null | Error> = [];
const sessoes: Sessao[] = [];
const runners: RunnerFalso[] = [];

vi.mock('graphile-worker', () => ({
  run: vi.fn(async () => {
    ordem.push('run');
    const runner = novoRunner();
    runners.push(runner);
    return runner;
  }),
}));
vi.mock('./travas-orfas', () => ({
  assumirTrabalho: vi.fn(async () => {
    ordem.push('assumir');
    const resposta = respostas.length ? respostas.shift() : novaSessao();
    if (resposta instanceof Error) throw resposta;
    if (resposta) sessoes.push(resposta);
    return resposta;
  }),
}));

const trabalhador = () =>
  new TrabalhadorJobs({} as Pool, new RegistroTarefas(), {
    get: (chave: string) => (chave === 'JOBS_WORKER' ? 'true' : undefined),
  } as unknown as ConfigService);

describe('TrabalhadorJobs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ordem.length = 0;
    respostas = [];
    sessoes.length = 0;
    runners.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('libera as travas de workers mortos antes de subir e solta a própria trava depois de parar', async () => {
    const t = trabalhador();

    await t.onApplicationBootstrap();
    await t.beforeApplicationShutdown();

    expect(ordem).toEqual(['assumir', 'run', 'stop', 'encerrar']);
  });

  it('para antes de o pool do banco fechar (o pool fecha no onApplicationShutdown)', () => {
    expect('onApplicationShutdown' in trabalhador()).toBe(false);
  });

  it('com outro trabalhador vivo, não sobe e tenta assumir de novo mais tarde', async () => {
    respostas = [null];
    const t = trabalhador();

    await t.onApplicationBootstrap();
    expect(t.rodando).toBe(false);
    expect(ordem).toEqual(['assumir']);

    await vi.advanceTimersByTimeAsync(RELIGAR_MAXIMO_MS);

    expect(t.rodando).toBe(true);
    expect(ordem).toEqual(['assumir', 'assumir', 'run']);
    await t.beforeApplicationShutdown();
  });

  it('quando a conexão da trava cai, para o runner, solta a sessão e reassume com outra conexão', async () => {
    const t = trabalhador();
    await t.onApplicationBootstrap();

    sessoes[0]?.perder('a conexão da trava caiu');
    await vi.advanceTimersByTimeAsync(0);
    expect(ordem).toEqual(['assumir', 'run', 'stop', 'encerrar']);
    expect(t.rodando).toBe(false);

    await vi.advanceTimersByTimeAsync(RELIGAR_INICIAL_MS);

    expect(ordem).toEqual(['assumir', 'run', 'stop', 'encerrar', 'assumir', 'run']);
    expect(t.rodando).toBe(true);
    await t.beforeApplicationShutdown();
  });

  it('quando a trava cai e outro processo a pega, fica sem trabalhador', async () => {
    respostas = [novaSessao(), null];
    const t = trabalhador();
    await t.onApplicationBootstrap();

    sessoes[0]?.perder('a conexão da trava caiu');
    await vi.advanceTimersByTimeAsync(RELIGAR_INICIAL_MS);

    expect(ordem).toEqual(['assumir', 'run', 'stop', 'encerrar', 'assumir']);
    expect(t.rodando).toBe(false);
    await t.beforeApplicationShutdown();
  });

  it('quando o runner para sozinho, solta a trava e religa', async () => {
    const t = trabalhador();
    await t.onApplicationBootstrap();

    runners[0]?.morrer(new Error('Worker exited unexpectedly'));
    await vi.advanceTimersByTimeAsync(RELIGAR_INICIAL_MS);

    expect(ordem).toEqual(['assumir', 'run', 'encerrar', 'assumir', 'run']);
    expect(t.rodando).toBe(true);
    await t.beforeApplicationShutdown();
  });

  it('com o banco fora, tenta assumir de novo com espera crescente', async () => {
    respostas = [new Error('connect ECONNREFUSED'), new Error('connect ECONNREFUSED')];
    const t = trabalhador();

    await t.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(RELIGAR_INICIAL_MS);
    expect(ordem).toEqual(['assumir', 'assumir']);
    await vi.advanceTimersByTimeAsync(RELIGAR_INICIAL_MS);
    expect(ordem).toEqual(['assumir', 'assumir']);
    await vi.advanceTimersByTimeAsync(RELIGAR_INICIAL_MS);

    expect(ordem).toEqual(['assumir', 'assumir', 'assumir', 'run']);
    await t.beforeApplicationShutdown();
  });

  it('no desligamento, com o runner preso (conexão morta), força a parada e termina no prazo', async () => {
    const t = trabalhador();
    await t.onApplicationBootstrap();
    (runners[0] as RunnerFalso).travar = true;
    let desligou = false;

    void t.beforeApplicationShutdown().then(() => {
      desligou = true;
    });
    await vi.advanceTimersByTimeAsync(PRAZO_PARADA_MS + PRAZO_KILL_MS);

    expect(desligou).toBe(true);
    expect(ordem).toEqual(['assumir', 'run', 'stop', 'kill', 'encerrar']);
  });

  it('no desligamento, cancela a próxima tentativa de assumir', async () => {
    respostas = [null];
    const t = trabalhador();
    await t.onApplicationBootstrap();

    await t.beforeApplicationShutdown();
    await vi.advanceTimersByTimeAsync(RELIGAR_MAXIMO_MS * 2);

    expect(ordem).toEqual(['assumir']);
  });
});
