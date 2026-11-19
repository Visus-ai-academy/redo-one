import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { contaControllerTrocarSenha } from '../../gen/clients/contaControllerTrocarSenha';
import { contaControllerObterQueryKey } from '../../gen/hooks/useContaControllerObter';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { TrocarSenha } from './TrocarSenha';

vi.mock('../../gen/clients/contaControllerTrocarSenha');

const trocar = vi.mocked(contaControllerTrocarSenha);

function responder(resultado: () => Promise<unknown>) {
  trocar.mockReturnValue({ unwrap: resultado } as never);
}

function erro400(data: unknown) {
  return new ResponseError({
    data,
    status: 400,
    statusText: '',
    request: new Request('http://api.test/conta/senha'),
    response: new Response(),
  });
}

async function preencher(atual: string, nova: string, repetir: string) {
  await userEvent.type(await screen.findByLabelText('Senha atual'), atual);
  await userEvent.type(screen.getByLabelText('Nova senha'), nova);
  await userEvent.type(screen.getByLabelText('Repita a nova senha'), repetir);
  await userEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
}

describe('TrocarSenha', () => {
  // Enviado antes da hidratação, um form sem method faria GET e poria os campos na URL.
  it('envia por POST mesmo antes do JavaScript carregar', async () => {
    renderComRotas(<TrocarSenha senhaAlteradaEm={null} />);

    const botao = await screen.findByRole('button', { name: /Trocar senha/ });
    expect(botao.closest('form')).toHaveAttribute('method', 'post');
  });

  beforeEach(() => {
    trocar.mockReset();
    responder(async () => ({ sessoesEncerradas: 2 }));
  });

  it('é a parte de Segurança, com a data da última troca', async () => {
    renderComRotas(<TrocarSenha senhaAlteradaEm="2026-10-02T15:00:00.000Z" />);

    const secao = await screen.findByRole('region', { name: 'Senha' });
    expect(secao).toHaveAttribute('id', 'seguranca');
    expect(secao).toHaveTextContent(
      'Trocada pela última vez em 02/10/2026. Ao trocar, suas outras sessões são encerradas.',
    );
  });

  it('troca a senha, diz quantas sessões caíram e limpa os campos', async () => {
    const { queryClient } = renderComRotas(<TrocarSenha senhaAlteradaEm={null} />);
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    await preencher('antiga123', 'novaSenha9', 'novaSenha9');

    await waitFor(() =>
      expect(trocar).toHaveBeenCalledWith(
        expect.objectContaining({ body: { senhaAtual: 'antiga123', novaSenha: 'novaSenha9' } }),
      ),
    );
    expect(await acharAviso()).toHaveTextContent(
      'Senha trocada. As outras 2 sessões foram encerradas.',
    );
    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
    expect(screen.getByLabelText('Nova senha')).toHaveValue('');
    expect(invalidar).toHaveBeenCalledWith({ queryKey: contaControllerObterQueryKey() });
  });

  it.each([
    [0, 'Senha trocada.'],
    [1, 'Senha trocada. A outra sessão foi encerrada.'],
  ])('com %i outra(s) sessão(ões) aberta(s), avisa certo', async (sessoesEncerradas, texto) => {
    responder(async () => ({ sessoesEncerradas }));
    renderComRotas(<TrocarSenha senhaAlteradaEm={null} />);

    await preencher('antiga123', 'novaSenha9', 'novaSenha9');

    expect(await acharAviso()).toHaveTextContent(new RegExp(`^${texto}$`));
  });

  it('mostra a recusa da API (senha atual errada)', async () => {
    const mensagem =
      'A senha atual não confere. Digite de novo ou use "Esqueci minha senha" no login.';
    responder(() => Promise.reject(erro400({ message: mensagem })));
    renderComRotas(<TrocarSenha senhaAlteradaEm={null} />);

    await preencher('errada123', 'novaSenha9', 'novaSenha9');

    expect(await screen.findByRole('alert')).toHaveTextContent(mensagem);
  });

  it('mostra os problemas da senha nova que a API recusou', async () => {
    responder(() =>
      Promise.reject(erro400({ message: 'Senha fraca.', problemas: ['Use letras e números.'] })),
    );
    renderComRotas(<TrocarSenha senhaAlteradaEm={null} />);

    await preencher('antiga123', 'novaSenha9', 'novaSenha9');

    expect(await screen.findByRole('alert')).toHaveTextContent('Use letras e números.');
  });

  it('não envia se a confirmação não repete a senha nova', async () => {
    renderComRotas(<TrocarSenha senhaAlteradaEm={null} />);

    await preencher('antiga123', 'novaSenha9', 'outraSenha9');

    expect(await screen.findByText('As senhas não são iguais.')).toBeInTheDocument();
    expect(trocar).not.toHaveBeenCalled();
  });
});
