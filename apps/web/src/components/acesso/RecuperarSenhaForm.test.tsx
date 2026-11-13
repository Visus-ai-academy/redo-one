import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { senhaControllerSolicitarRecuperacao } from '../../gen/clients/senhaControllerSolicitarRecuperacao';
import { renderComRotas } from '../../test/render';
import { RecuperarSenhaForm } from './RecuperarSenhaForm';

vi.mock('../../gen/clients/senhaControllerSolicitarRecuperacao');

const solicitar = vi.mocked(senhaControllerSolicitarRecuperacao);

describe('RecuperarSenhaForm', () => {
  beforeEach(() => {
    solicitar.mockReset();
    solicitar.mockReturnValue({ unwrap: async () => undefined } as never);
  });

  it('pede o link e mostra como seguir, sem dizer se a conta existe', async () => {
    renderComRotas(<RecuperarSenhaForm />);

    await userEvent.type(await screen.findByLabelText('E-mail da conta'), 'maria@empresa.com.br');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(solicitar).toHaveBeenCalledWith(
      expect.objectContaining({ body: { email: 'maria@empresa.com.br' } }),
    );
    expect(await screen.findByRole('heading', { name: 'Confira seu e-mail' })).toBeInTheDocument();
    expect(screen.getByText(/vale por 1 hora/)).toBeInTheDocument();
  });

  it('volta ao formulário para enviar de novo', async () => {
    renderComRotas(<RecuperarSenhaForm />);
    await userEvent.type(await screen.findByLabelText('E-mail da conta'), 'maria@empresa.com.br');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));

    await userEvent.click(await screen.findByRole('button', { name: 'envie de novo' }));

    expect(screen.getByLabelText('E-mail da conta')).toHaveValue('maria@empresa.com.br');
  });

  it('recusa e-mail inválido', async () => {
    renderComRotas(<RecuperarSenhaForm />);

    await userEvent.type(await screen.findByLabelText('E-mail da conta'), 'maria');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(
      await screen.findByText('Informe um e-mail válido, como nome@empresa.com.br.'),
    ).toBeInTheDocument();
    expect(solicitar).not.toHaveBeenCalled();
  });
});
