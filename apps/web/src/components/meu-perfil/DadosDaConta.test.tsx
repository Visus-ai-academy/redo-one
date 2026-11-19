import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { contaControllerAtualizar } from '../../gen/clients/contaControllerAtualizar';
import { contaControllerObterQueryKey } from '../../gen/hooks/useContaControllerObter';
import type { MinhaContaDto } from '../../gen/types/MinhaContaDto';
import { SESSAO_QUERY_KEY } from '../../lib/sessao';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { DadosDaConta } from './DadosDaConta';

vi.mock('../../gen/clients/contaControllerAtualizar');

const atualizar = vi.mocked(contaControllerAtualizar);

const conta: MinhaContaDto = {
  nome: 'Carlos Andrade',
  email: 'carlos@empresa.com.br',
  cpfFinal: '41',
  papeis: [{ id: 'p', nome: 'Administrador' }],
  senhaAlteradaEm: null,
  sessoesAbertas: [],
};

describe('DadosDaConta', () => {
  beforeEach(() => {
    atualizar.mockReset();
    atualizar.mockReturnValue({ unwrap: async () => undefined } as never);
  });

  it('deixa editar só o nome; e-mail, CPF mascarado e papel são só leitura', async () => {
    renderComRotas(<DadosDaConta conta={conta} />);

    expect(await screen.findByRole('textbox', { name: 'Nome' })).toHaveValue('Carlos Andrade');
    expect(screen.getByRole('textbox', { name: 'E-mail' })).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: 'E-mail' })).toHaveAccessibleDescription(
      'Para trocar, fale com quem administra o One.',
    );
    expect(screen.getByRole('textbox', { name: 'CPF' })).toHaveValue('•••.•••.•••-41');
    expect(screen.getByRole('textbox', { name: 'Papel' })).toHaveValue('Administrador');
  });

  it('salva o nome e atualiza a sessão, que mostra o nome no menu', async () => {
    const { queryClient } = renderComRotas(<DadosDaConta conta={conta} />);
    queryClient.setQueryData(SESSAO_QUERY_KEY, { antigo: true });
    queryClient.setQueryData(contaControllerObterQueryKey(), conta);
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    const nome = await screen.findByRole('textbox', { name: 'Nome' });
    await userEvent.clear(nome);
    await userEvent.type(nome, 'Carlos A. Silva');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar dados' }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith(
        expect.objectContaining({ body: { nome: 'Carlos A. Silva' } }),
      ),
    );
    expect(await acharAviso()).toHaveTextContent('Dados salvos.');
    expect(invalidar).toHaveBeenCalledWith({ queryKey: SESSAO_QUERY_KEY });
    expect(invalidar).toHaveBeenCalledWith({ queryKey: contaControllerObterQueryKey() });
  });

  it('não salva nome vazio', async () => {
    renderComRotas(<DadosDaConta conta={conta} />);

    await userEvent.clear(await screen.findByRole('textbox', { name: 'Nome' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar dados' }));

    expect(await screen.findByText('Informe o nome.')).toBeInTheDocument();
    expect(atualizar).not.toHaveBeenCalled();
  });

  it('avisa quando não consegue salvar', async () => {
    atualizar.mockReturnValue({ unwrap: () => Promise.reject(new Error('rede')) } as never);
    renderComRotas(<DadosDaConta conta={conta} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Salvar dados' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar');
  });
});
