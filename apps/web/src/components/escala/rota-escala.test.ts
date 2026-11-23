import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ausenciasControllerListar } from '../../gen/clients/ausenciasControllerListar';
import { ocorrenciasControllerListar } from '../../gen/clients/ocorrenciasControllerListar';
import { escopoApiControllerMeuQueryKey } from '../../gen/hooks/useEscopoApiControllerMeu';
import { frentesControllerListarQueryKey } from '../../gen/hooks/useFrentesControllerListar';
import { turnosControllerListarQueryKey } from '../../gen/hooks/useTurnosControllerListar';
import { Route } from '../../routes/_app/escala/index';

vi.mock('../../gen/clients/ocorrenciasControllerListar', () => ({
  ocorrenciasControllerListar: vi.fn(),
}));

vi.mock('../../gen/clients/ausenciasControllerListar', () => ({
  ausenciasControllerListar: vi.fn(),
}));

const listar = vi.mocked(ocorrenciasControllerListar);
const listarAusencias = vi.mocked(ausenciasControllerListar);
const ATIVOS = { query: { ativo: true, porPagina: 100 } };
const PAGINA_VAZIA = { itens: [], total: 0, pagina: 1, porPagina: 100 };

function contexto(sessao = { acessoTotal: true, permissoes: [] as string[] }) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(turnosControllerListarQueryKey(ATIVOS), PAGINA_VAZIA);
  queryClient.setQueryData(frentesControllerListarQueryKey(ATIVOS), PAGINA_VAZIA);
  queryClient.setQueryData(escopoApiControllerMeuQueryKey(), { escopo: null });
  return { queryClient, sessao };
}

/** Roda o loader da rota; `true` se terminou sem esperar a busca das ocorrências. */
async function terminaSemEsperar(cause: 'enter' | 'stay') {
  const loader = Route.options.loader as (opcoes: unknown) => Promise<unknown>;
  const fim = loader({
    context: contexto(),
    deps: { modo: 'semana', data: '2026-12-09', frenteIds: ['f1'] },
    cause,
  }).then(() => true);
  const espera = new Promise<false>((resolver) => setTimeout(() => resolver(false), 50));
  return Promise.race([fim, espera]);
}

beforeEach(() => {
  listar.mockReset();
  listarAusencias.mockReset();
  listarAusencias.mockReturnValue({
    unwrap: async () => ({ itens: [], total: 0, pagina: 1, porPagina: 20 }),
  } as never);
  // A API não responde: só termina quem não espera por ela.
  listar.mockReturnValue({ unwrap: () => new Promise(() => {}) } as never);
});

describe('loader da tela Escala', () => {
  it('ao abrir a tela, espera as ocorrências (a primeira pintura já vem com a escala)', async () => {
    expect(await terminaSemEsperar('enter')).toBe(false);
  });

  it('na própria tela (outra semana, outro filtro), não segura a navegação esperando a API', async () => {
    // Senão a URL muda e a tela só acompanha quando a busca volta: um segundo clique (outra
    // frente no filtro, ▶ de novo) parte do estado velho e desfaz o primeiro.
    expect(await terminaSemEsperar('stay')).toBe(true);
  });
});

describe('modo Ausências sem ausencias.ver', () => {
  const loader = Route.options.loader as (opcoes: unknown) => Promise<unknown>;
  const rodar = (permissoes: string[]) =>
    loader({
      context: contexto({ acessoTotal: false, permissoes }),
      deps: { modo: 'ausencias', data: '2026-12-09' },
      cause: 'enter',
    });

  it('não busca as ausências (a API recusaria) e mostra a semana no lugar', async () => {
    listar.mockReturnValue({ unwrap: async () => ({ ocorrencias: [], conflitos: [] }) } as never);

    await rodar(['escala.ver']);

    expect(listarAusencias).not.toHaveBeenCalled();
    expect(listar).toHaveBeenCalled();
  });

  it('com a permissão, busca as ausências da semana', async () => {
    await rodar(['escala.ver', 'ausencias.ver']);

    expect(listarAusencias).toHaveBeenCalled();
  });
});

describe('busca da escala na URL', () => {
  const ID = '6e0f3f74-3155-50fc-98fb-2c094d705f5e';
  const validar = (busca: Record<string, unknown>) =>
    (Route.options.validateSearch as { parse: (v: unknown) => Record<string, unknown> }).parse(
      busca,
    );

  it('frentes e turnos: aceita a lista e o valor único (uuid simples na URL)', () => {
    expect(validar({ frenteIds: [ID], turnoIds: ID })).toMatchObject({
      frenteIds: [ID],
      turnoIds: [ID],
    });
    expect(validar({ frenteIds: 'nao-e-uuid' }).frenteIds).toBeUndefined();
    expect(validar({ frenteIds: [] }).frenteIds).toBeUndefined();
  });

  it('o plantão aberto fica na URL (alocação e dia), sem refazer a busca da semana', () => {
    expect(validar({ plantao: `${ID}_2026-12-09` }).plantao).toBe(`${ID}_2026-12-09`);
    expect(validar({ plantao: 'qualquer' }).plantao).toBeUndefined();
    const deps = (Route.options.loaderDeps as (o: unknown) => Record<string, unknown>)({
      search: { data: '2026-12-09', plantao: `${ID}_2026-12-09` },
    });
    expect(deps).not.toHaveProperty('plantao');
  });
});
