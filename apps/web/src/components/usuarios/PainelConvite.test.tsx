import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { usuariosControllerConvidar } from '../../gen/clients/usuariosControllerConvidar';
import type { PapelAtribuivelDto } from '../../gen/types/PapelAtribuivelDto';
import { renderComRotas } from '../../test/render';
import { escolherOpcao } from '../../test/select';
import { PainelConvite } from './PainelConvite';

vi.mock('../../gen/clients/usuariosControllerConvidar');

const convidar = vi.mocked(usuariosControllerConvidar);

const papeis: PapelAtribuivelDto[] = [
  { id: 'p-admin', nome: 'Administrador', atribuivel: false },
  { id: 'p-fin', nome: 'Financeiro', atribuivel: true },
];

function montar() {
  const onConvidado = vi.fn();
  const onCancelar = vi.fn();
  const resultado = renderComRotas(
    <PainelConvite papeis={papeis} onConvidado={onConvidado} onCancelar={onCancelar} />,
  );
  return { ...resultado, onConvidado, onCancelar };
}

async function preencher({ cpf }: { cpf?: string } = {}) {
  await userEvent.type(await screen.findByRole('textbox', { name: 'Nome' }), 'Maria Souza');
  await userEvent.type(screen.getByRole('textbox', { name: 'E-mail' }), 'maria@empresa.com.br');
  if (cpf) await userEvent.type(screen.getByRole('textbox', { name: 'CPF' }), cpf);
  await escolherOpcao('Papel', 'Financeiro');
  await userEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));
}

describe('PainelConvite', () => {
  beforeEach(() => {
    convidar.mockReset();
    convidar.mockReturnValue({ unwrap: async () => ({ id: 'u-nova' }) } as never);
  });

  it('explica o convite e só oferece os papéis que se pode atribuir', async () => {
    montar();

    expect(await screen.findByRole('dialog', { name: 'Convidar usuário' })).toHaveTextContent(
      'A pessoa recebe um e-mail com o link para criar a senha. O link vale por 7 dias.',
    );
    expect(screen.getByRole('textbox', { name: 'CPF' })).toHaveAccessibleDescription(
      'Com o CPF, a pessoa também pode entrar digitando o CPF.',
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Papel' }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Financeiro',
    ]);
  });

  it('envia o convite e abre a pessoa nova', async () => {
    const { onConvidado, queryClient } = montar();
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    await preencher({ cpf: '123.456.789-01' });

    await waitFor(() =>
      expect(convidar).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            nome: 'Maria Souza',
            email: 'maria@empresa.com.br',
            cpf: '12345678901',
            papelId: 'p-fin',
          },
        }),
      ),
    );
    expect(onConvidado).toHaveBeenCalledWith('u-nova', 'maria@empresa.com.br');
    expect(invalidar).toHaveBeenCalledWith({ queryKey: [{ url: '/usuarios' }] });
  });

  it('CPF é opcional', async () => {
    montar();

    await preencher();

    await waitFor(() =>
      expect(convidar).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ cpf: null }) }),
      ),
    );
  });

  it('recusa CPF sem 11 dígitos', async () => {
    montar();

    await preencher({ cpf: '123.456' });

    expect(await screen.findByText('O CPF precisa ter 11 dígitos.')).toBeInTheDocument();
    expect(convidar).not.toHaveBeenCalled();
  });

  it('mostra a recusa da API (e-mail já cadastrado)', async () => {
    convidar.mockReturnValue({
      unwrap: () =>
        Promise.reject(
          new ResponseError({
            data: { message: 'Já existe uma conta com este e-mail.' },
            status: 409,
            statusText: '',
            request: new Request('http://api.test/usuarios'),
            response: new Response(),
          }),
        ),
    } as never);
    montar();

    await preencher();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe uma conta com este e-mail.',
    );
  });

  it('cancela', async () => {
    const { onCancelar } = montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(onCancelar).toHaveBeenCalled();
  });
});
