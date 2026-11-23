import type { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RegistroTarefas } from './registro-tarefas';
import { TrabalhadorJobs } from './trabalhador-jobs';

const ordem: string[] = [];
const sessao = {
  liberados: [] as string[],
  encerrar: vi.fn(async () => {
    ordem.push('encerrar');
  }),
};
let assumida: typeof sessao | null = sessao;

vi.mock('graphile-worker', () => ({
  run: vi.fn(async () => {
    ordem.push('run');
    return {
      stop: async () => {
        ordem.push('stop');
      },
    };
  }),
}));
vi.mock('./travas-orfas', () => ({
  assumirTrabalho: vi.fn(async () => {
    ordem.push('assumir');
    return assumida;
  }),
}));

const trabalhador = () =>
  new TrabalhadorJobs({} as Pool, new RegistroTarefas(), {
    get: (chave: string) => (chave === 'JOBS_WORKER' ? 'true' : undefined),
  } as unknown as ConfigService);

describe('TrabalhadorJobs', () => {
  beforeEach(() => {
    ordem.length = 0;
    assumida = sessao;
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

  it('com outro trabalhador vivo, sobe sem liberar nada (a biblioteca divide as filas)', async () => {
    assumida = null;
    const t = trabalhador();

    await t.onApplicationBootstrap();
    await t.beforeApplicationShutdown();

    expect(t.rodando).toBe(true);
    expect(ordem).toEqual(['assumir', 'run', 'stop']);
  });
});
