import { QueryClient } from '@tanstack/react-query';
import { isRedirect } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';

import { exigirSessao, redirecionarSeLogado } from './guarda';
import { SESSAO_QUERY_KEY } from './sessao';

vi.mock('../gen/clients/sessaoControllerAtual');

const sessao = {
  usuario: { id: '1', nome: 'Maria Souza', email: 'm@e.com', papelId: 'p' },
  papel: 'Financeiro',
  acessoTotal: false,
  permissoes: [],
};

function clienteCom(valor: unknown) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(SESSAO_QUERY_KEY, valor);
  return queryClient;
}

async function capturar(promessa: Promise<unknown>) {
  try {
    await promessa;
  } catch (erro) {
    return erro;
  }
  throw new Error('esperava um redirect');
}

describe('exigirSessao', () => {
  it('devolve a sessão quando há login', async () => {
    await expect(exigirSessao(clienteCom(sessao), '/configuracoes')).resolves.toEqual(sessao);
  });

  it('sem sessão, manda para o login guardando para onde a pessoa ia', async () => {
    const erro = await capturar(exigirSessao(clienteCom(null), '/configuracoes/usuarios?pagina=2'));

    expect(isRedirect(erro)).toBe(true);
    expect((erro as { options: unknown }).options).toMatchObject({
      to: '/login',
      search: { redirect: '/configuracoes/usuarios?pagina=2' },
    });
  });

  it('não guarda o início como destino', async () => {
    const erro = await capturar(exigirSessao(clienteCom(null), '/'));

    expect((erro as { options: { search?: unknown } }).options.search).toEqual({});
  });
});

describe('redirecionarSeLogado', () => {
  it('quem já entrou vai direto para o destino', async () => {
    const erro = await capturar(redirecionarSeLogado(clienteCom(sessao), '/configuracoes'));

    expect(isRedirect(erro)).toBe(true);
    expect((erro as { options: unknown }).options).toMatchObject({ href: '/configuracoes' });
  });

  it('sem sessão, segue no login', async () => {
    await expect(redirecionarSeLogado(clienteCom(null), '/')).resolves.toBeUndefined();
  });
});
