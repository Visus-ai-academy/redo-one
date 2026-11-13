import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../gen/.kubb/client';
import { sessaoControllerAtual } from '../gen/clients/sessaoControllerAtual';
import { SESSAO_QUERY_KEY, sessaoQueryOptions } from './sessao';

vi.mock('../gen/clients/sessaoControllerAtual');

const atual = vi.mocked(sessaoControllerAtual);

function erro(status: number) {
  return new ResponseError({
    data: {},
    status,
    statusText: '',
    request: new Request('http://api.test/sessao'),
    response: new Response(),
  });
}

describe('sessaoQueryOptions', () => {
  beforeEach(() => atual.mockReset());

  it('devolve o usuário e as permissões da sessão', async () => {
    const sessao = {
      usuario: { id: '1', nome: 'Maria Souza', email: 'm@e.com', papelId: 'p' },
      acessoTotal: false,
      permissoes: ['usuarios.ver'],
    };
    atual.mockReturnValue({ unwrap: async () => sessao } as never);

    expect(await new QueryClient().fetchQuery(sessaoQueryOptions())).toEqual(sessao);
  });

  it('devolve null sem sessão (401)', async () => {
    atual.mockReturnValue({ unwrap: () => Promise.reject(erro(401)) } as never);

    expect(await new QueryClient().fetchQuery(sessaoQueryOptions())).toBeNull();
  });

  it('deixa passar outras falhas', async () => {
    atual.mockReturnValue({ unwrap: () => Promise.reject(erro(503)) } as never);

    await expect(new QueryClient().fetchQuery(sessaoQueryOptions())).rejects.toThrow();
  });

  it('usa uma chave fixa, para o login e o sair invalidarem', () => {
    expect(sessaoQueryOptions().queryKey).toEqual(SESSAO_QUERY_KEY);
  });
});
