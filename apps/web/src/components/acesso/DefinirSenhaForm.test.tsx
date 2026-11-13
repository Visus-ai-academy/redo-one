import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { senhaControllerDefinir } from '../../gen/clients/senhaControllerDefinir';
import type { InfoLinkDto } from '../../gen/types/InfoLinkDto';
import { SESSAO_QUERY_KEY } from '../../lib/sessao';
import { renderComRotas } from '../../test/render';
import { DefinirSenhaForm, LinkExpirado } from './DefinirSenhaForm';

vi.mock('../../gen/clients/senhaControllerDefinir');

const definir = vi.mocked(senhaControllerDefinir);

const convite: InfoLinkDto = {
  tipo: 'convite',
  nome: 'Maria Souza',
  email: 'maria.souza@empresa.com.br',
  papel: 'Financeiro',
  convidadoPor: 'Carlos Andrade',
};

function erroDaApi(status: number, data: unknown) {
  return new ResponseError({
    data,
    status,
    statusText: '',
    request: new Request('http://api.test/senha/definir'),
    response: new Response(),
  });
}

async function digitarSenhas(senha: string, confirmacao: string) {
  await userEvent.type(await screen.findByLabelText('Nova senha'), senha);
  await userEvent.type(screen.getByLabelText('Repita a senha'), confirmacao);
}

describe('DefinirSenhaForm', () => {
  beforeEach(() => {
    definir.mockReset();
    definir.mockReturnValue({ unwrap: async () => ({}) } as never);
  });

  it('no convite, cumprimenta pelo nome e diz quem convidou, o papel e a conta', async () => {
    renderComRotas(<DefinirSenhaForm token="t" link={convite} />);

    expect(
      await screen.findByRole('heading', { name: 'Crie sua senha, Maria' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Carlos Andrade convidou você/)).toHaveTextContent(
      'Carlos Andrade convidou você para o One com o papel Financeiro. Sua conta é maria.souza@empresa.com.br.',
    );
    expect(screen.getByRole('button', { name: 'Criar senha e entrar' })).toBeInTheDocument();
  });

  it('na recuperação, avisa que as outras sessões serão encerradas', async () => {
    renderComRotas(
      <DefinirSenhaForm token="t" link={{ ...convite, tipo: 'recuperacao', convidadoPor: null }} />,
    );

    expect(await screen.findByRole('heading', { name: 'Crie uma nova senha' })).toBeInTheDocument();
    expect(
      screen.getByText(/as outras sessões abertas desta conta são encerradas/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeInTheDocument();
  });

  it('mostra os requisitos atendidos enquanto a pessoa digita', async () => {
    renderComRotas(<DefinirSenhaForm token="t" link={convite} />);

    await digitarSenhas('abcdefg1', 'abc');

    const requisitos = within(screen.getByRole('list', { name: 'Requisitos da senha' }));
    expect(requisitos.getByText('Pelo menos 8 caracteres')).toHaveTextContent('(atendido)');
    expect(requisitos.getByText('Letras e números')).toHaveTextContent('(atendido)');
    expect(requisitos.getByText('As duas senhas são iguais')).toHaveTextContent('(pendente)');
  });

  it('não envia se as senhas não são iguais', async () => {
    renderComRotas(<DefinirSenhaForm token="t" link={convite} />);

    await digitarSenhas('abcdefg1', 'abcdefg2');
    await userEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));

    expect(await screen.findByText('As senhas não são iguais.')).toBeInTheDocument();
    expect(definir).not.toHaveBeenCalled();
  });

  it('cria a senha, entra e vai para o início', async () => {
    const { router } = renderComRotas(<DefinirSenhaForm token="tok-123" link={convite} />, {
      caminho: '/definir-senha?token=tok-123',
    });

    await digitarSenhas('abcdefg1', 'abcdefg1');
    await userEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));

    expect(definir).toHaveBeenCalledWith(
      expect.objectContaining({ body: { token: 'tok-123', senha: 'abcdefg1' } }),
    );
    await waitFor(() => expect(router.state.location.href).toBe('/'));
  });

  it('esquece a sessão anterior em cache depois de criar a senha', async () => {
    const { queryClient } = renderComRotas(<DefinirSenhaForm token="t" link={convite} />);
    queryClient.setQueryData(SESSAO_QUERY_KEY, null);

    await digitarSenhas('abcdefg1', 'abcdefg1');
    await userEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));

    await waitFor(() => expect(queryClient.getQueryData(SESSAO_QUERY_KEY)).toBeUndefined());
  });

  it('mostra o que a API recusou na senha', async () => {
    definir.mockReturnValue({
      unwrap: () =>
        Promise.reject(
          erroDaApi(400, { message: 'Senha fraca.', problemas: ['Use letras e números.'] }),
        ),
    } as never);
    renderComRotas(<DefinirSenhaForm token="t" link={convite} />);

    await digitarSenhas('abcdefg1', 'abcdefg1');
    await userEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Use letras e números.');
  });

  it('troca para o aviso de link vencido se ele expirar antes de salvar', async () => {
    definir.mockReturnValue({
      unwrap: () => Promise.reject(erroDaApi(404, {})),
    } as never);
    renderComRotas(<DefinirSenhaForm token="t" link={convite} />);

    await digitarSenhas('abcdefg1', 'abcdefg1');
    await userEvent.click(screen.getByRole('button', { name: 'Criar senha e entrar' }));

    expect(
      await screen.findByRole('heading', { name: 'Este link não vale mais' }),
    ).toBeInTheDocument();
  });
});

describe('LinkExpirado', () => {
  it('explica e oferece pedir um link novo', async () => {
    renderComRotas(<LinkExpirado />);

    expect(
      await screen.findByRole('heading', { name: 'Este link não vale mais' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir link novo' })).toHaveAttribute(
      'href',
      '/recuperar-senha',
    );
    expect(screen.getByRole('link', { name: 'Voltar para o login' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});
