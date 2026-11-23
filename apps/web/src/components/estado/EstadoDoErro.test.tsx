import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { renderComRotas } from '../../test/render';
import { EstadoDoErro } from './EstadoDoErro';

const http = (status: number, data: unknown = {}) =>
  new ResponseError({
    data,
    status,
    statusText: '',
    request: new Request('http://api.test/x'),
    response: new Response(),
  });

const voltar = { to: '/', rotulo: 'Voltar para Médicos' } as const;

describe('EstadoDoErro', () => {
  it('403: diz que o papel não permite e quem pode liberar', async () => {
    renderComRotas(<EstadoDoErro erro={http(403)} oQue="o médico" />);

    expect(await screen.findByText('Sem permissão para ver o médico')).toBeInTheDocument();
    expect(screen.getByText(/quem administra o One/)).toBeInTheDocument();
  });

  it('404: não encontrado, com o caminho de volta para a lista', async () => {
    renderComRotas(<EstadoDoErro erro={http(404)} oQue="o médico" voltar={voltar} />);

    expect(await screen.findByText('Não encontramos o médico')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para Médicos' })).toHaveAttribute('href', '/');
  });

  it('409: mostra a mensagem da API e oferece recarregar', async () => {
    const recarregar = vi.fn();
    renderComRotas(
      <EstadoDoErro
        erro={http(409, { message: 'Ana Souza alterou o médico às 14:02.' })}
        oQue="o médico"
        onTentarDeNovo={recarregar}
      />,
    );

    expect(await screen.findByText('Ana Souza alterou o médico às 14:02.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Recarregar' }));
    expect(recarregar).toHaveBeenCalled();
  });

  it('500: diz o que houve e deixa tentar de novo', async () => {
    const tentar = vi.fn();
    renderComRotas(<EstadoDoErro erro={http(500)} oQue="os médicos" onTentarDeNovo={tentar} />);

    expect(await screen.findByText('Não foi possível carregar os médicos')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/servidor/);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(tentar).toHaveBeenCalled();
  });

  it('queda de rede: fala da conexão', async () => {
    renderComRotas(
      <EstadoDoErro
        erro={new TypeError('Failed to fetch')}
        oQue="os médicos"
        onTentarDeNovo={vi.fn()}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/conexão/);
  });

  it('401: leva ao login, voltando para a mesma tela', async () => {
    renderComRotas(<EstadoDoErro erro={http(401)} oQue="os médicos" />, {
      caminho: '/cadastros/medicos?id=7',
    });

    expect(await screen.findByRole('link', { name: 'Entrar de novo' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fcadastros%2Fmedicos%3Fid%3D7',
    );
  });

  it('nunca mostra "Algo deu errado" nem o código do erro', async () => {
    renderComRotas(<EstadoDoErro erro={http(500)} oQue="os médicos" onTentarDeNovo={vi.fn()} />);

    await screen.findByRole('alert');
    expect(screen.queryByText(/Algo deu errado|500/)).not.toBeInTheDocument();
  });
});
