import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { sessaoControllerEntrar } from '../../gen/clients/sessaoControllerEntrar';
import { renderComRotas } from '../../test/render';
import { LoginForm } from './LoginForm';

vi.mock('../../gen/clients/sessaoControllerEntrar');

const entrar = vi.mocked(sessaoControllerEntrar);

function responder(resultado: () => Promise<unknown>) {
  entrar.mockReturnValue({ unwrap: resultado } as never);
}

function erroDaApi(status: number, data: unknown) {
  return new ResponseError({
    data,
    status,
    statusText: '',
    request: new Request('http://api.test/sessao'),
    response: new Response(),
  });
}

async function preencherEEntrar() {
  await userEvent.type(await screen.findByLabelText('E-mail ou CPF'), 'maria@empresa.com.br');
  await userEvent.type(screen.getByLabelText('Senha'), 'senha123');
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('LoginForm', () => {
  beforeEach(() => entrar.mockReset());

  it('entra com e-mail e senha e vai para o destino pedido', async () => {
    responder(async () => ({}));
    const { router } = renderComRotas(<LoginForm destino="/configuracoes/usuarios" />);

    await preencherEEntrar();

    expect(entrar).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { identificador: 'maria@empresa.com.br', senha: 'senha123' },
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/configuracoes/usuarios'));
  });

  it('pede os dois campos antes de enviar', async () => {
    renderComRotas(<LoginForm destino="/" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Informe o e-mail ou o CPF.')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument();
    expect(entrar).not.toHaveBeenCalled();
  });

  it('mostra o erro da API sem dizer se a conta existe', async () => {
    responder(() =>
      Promise.reject(erroDaApi(401, { message: 'E-mail, CPF ou senha incorretos.' })),
    );
    renderComRotas(<LoginForm destino="/" />);

    await preencherEEntrar();

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail, CPF ou senha incorretos.');
  });

  it('diz até que horas o acesso está bloqueado', async () => {
    responder(() =>
      Promise.reject(
        erroDaApi(429, {
          message: 'Acesso bloqueado por excesso de tentativas.',
          bloqueadoAte: '2026-11-13T17:32:00.000Z',
        }),
      ),
    );
    renderComRotas(<LoginForm destino="/" />);

    await preencherEEntrar();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Acesso bloqueado até 14:32');
    expect(screen.getByRole('link', { name: 'crie uma nova senha' })).toHaveAttribute(
      'href',
      '/recuperar-senha',
    );
  });
});
