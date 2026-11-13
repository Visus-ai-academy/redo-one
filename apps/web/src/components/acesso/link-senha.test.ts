import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { senhaControllerConsultarLink } from '../../gen/clients/senhaControllerConsultarLink';
import { linkSenhaQueryOptions } from './link-senha';

vi.mock('../../gen/clients/senhaControllerConsultarLink');

const consultar = vi.mocked(senhaControllerConsultarLink);

function erro(status: number) {
  return new ResponseError({
    data: {},
    status,
    statusText: '',
    request: new Request('http://api.test/senha/link'),
    response: new Response(),
  });
}

describe('linkSenhaQueryOptions', () => {
  beforeEach(() => consultar.mockReset());

  it('devolve os dados do link válido', async () => {
    const link = {
      tipo: 'convite',
      nome: 'Maria',
      email: 'm@e.com',
      papel: 'X',
      convidadoPor: null,
    };
    consultar.mockReturnValue({ unwrap: async () => link } as never);

    const dados = await new QueryClient().fetchQuery(linkSenhaQueryOptions('tok'));

    expect(consultar).toHaveBeenCalledWith(expect.objectContaining({ body: { token: 'tok' } }));
    expect(dados).toEqual(link);
  });

  it('devolve null para link vencido, usado ou inexistente', async () => {
    consultar.mockReturnValue({ unwrap: () => Promise.reject(erro(404)) } as never);

    expect(await new QueryClient().fetchQuery(linkSenhaQueryOptions('tok'))).toBeNull();
  });

  it('devolve null sem token, sem chamar a API', async () => {
    expect(await new QueryClient().fetchQuery(linkSenhaQueryOptions(undefined))).toBeNull();
    expect(consultar).not.toHaveBeenCalled();
  });

  it('deixa passar outras falhas', async () => {
    consultar.mockReturnValue({ unwrap: () => Promise.reject(erro(500)) } as never);

    await expect(new QueryClient().fetchQuery(linkSenhaQueryOptions('tok'))).rejects.toThrow();
  });
});
