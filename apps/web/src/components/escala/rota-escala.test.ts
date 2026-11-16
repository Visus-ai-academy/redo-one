import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ocorrenciasControllerListar } from '../../gen/clients/ocorrenciasControllerListar';
import { escopoApiControllerMeuQueryKey } from '../../gen/hooks/useEscopoApiControllerMeu';
import { frentesControllerListarQueryKey } from '../../gen/hooks/useFrentesControllerListar';
import { turnosControllerListarQueryKey } from '../../gen/hooks/useTurnosControllerListar';
import { Route } from '../../routes/_app/escala/index';

vi.mock('../../gen/clients/ocorrenciasControllerListar', () => ({
  ocorrenciasControllerListar: vi.fn(),
}));

const listar = vi.mocked(ocorrenciasControllerListar);
const ATIVOS = { query: { ativo: true, porPagina: 100 } };
const PAGINA_VAZIA = { itens: [], total: 0, pagina: 1, porPagina: 100 };

function contexto() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(turnosControllerListarQueryKey(ATIVOS), PAGINA_VAZIA);
  queryClient.setQueryData(frentesControllerListarQueryKey(ATIVOS), PAGINA_VAZIA);
  queryClient.setQueryData(escopoApiControllerMeuQueryKey(), { escopo: null });
  return { queryClient, sessao: { acessoTotal: true, permissoes: [] } };
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
