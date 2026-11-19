import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { UsuarioResumoDto } from '../../gen/types/UsuarioResumoDto';
import { SecaoAcesso, type SecaoAcessoProps } from './SecaoAcesso';

const papeis = [
  { id: 'p-fin', nome: 'Financeiro', atribuivel: true },
  { id: 'p-med', nome: 'Médico', atribuivel: true },
  { id: 'p-admin', nome: 'Administrador', atribuivel: false },
];

const conta: UsuarioResumoDto = {
  id: 'u-1',
  nome: 'Augusto Lima',
  email: 'augusto@clinica.com',
  papeis: [{ id: 'p-med', nome: 'Médico' }],
  situacao: 'convite_pendente',
  ultimoAcessoEm: null,
};

function montar(props: Partial<SecaoAcessoProps> = {}) {
  const handlers = {
    onConvidar: vi.fn(async () => undefined),
    onLigar: vi.fn(async () => undefined),
    onDesligar: vi.fn(async () => undefined),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SecaoAcesso
        medico={{ nome: 'Dr. Augusto Lima', email: 'augusto@clinica.com' }}
        conta={null}
        papeis={papeis}
        podeConvidar
        podeLigar
        buscarUsuarios={async () => [
          { valor: 'u-9', rotulo: 'Carla Souza', detalhe: 'carla@x.com' },
        ]}
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  );
  return handlers;
}

describe('SecaoAcesso', () => {
  it('sem conta, convida já com o nome, o e-mail do médico e o papel Médico', async () => {
    const { onConvidar } = montar();

    expect(screen.getByText('Este médico ainda não tem acesso ao portal.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'E-mail' })).toHaveValue('augusto@clinica.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));

    expect(onConvidar).toHaveBeenCalledWith({
      nome: 'Dr. Augusto Lima',
      email: 'augusto@clinica.com',
      papelId: 'p-med',
    });
  });

  it('sem conta, liga a uma conta que já existe', async () => {
    const { onLigar } = montar();

    await userEvent.type(screen.getByRole('combobox', { name: 'Conta que já existe' }), 'car');
    await userEvent.click(await screen.findByRole('option', { name: /Carla Souza/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Ligar conta' }));

    expect(onLigar).toHaveBeenCalledWith('u-9');
  });

  it('com conta, mostra a situação e desliga depois de confirmar', async () => {
    const { onDesligar } = montar({ conta });

    expect(screen.getByText('augusto@clinica.com')).toBeInTheDocument();
    expect(screen.getByText('Convite pendente')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Desligar conta' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Desligar conta', hidden: false }),
    );

    expect(onDesligar).toHaveBeenCalled();
  });

  it('sem as permissões, só mostra a situação', () => {
    montar({ podeConvidar: false, podeLigar: false });

    expect(screen.getByText('Este médico ainda não tem acesso ao portal.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar convite' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ligar conta' })).not.toBeInTheDocument();
  });
});
