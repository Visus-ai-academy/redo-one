import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { UnidadesCliente, type UnidadesClienteProps } from './UnidadesCliente';

function montar(props: Partial<UnidadesClienteProps> = {}) {
  const handlers = {
    onAdicionar: vi.fn(async () => undefined),
    onRemover: vi.fn(async () => undefined),
    onDesfazer: vi.fn(async () => undefined),
    onAbrir: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UnidadesCliente
        unificadoEm={null}
        unidades={[]}
        buscarClientes={async () => [{ valor: 'cl-cedi', rotulo: 'CEDI_RJ' }]}
        podeCriar
        podeExcluir
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  );
  return handlers;
}

describe('UnidadesCliente', () => {
  it('no principal, lista as unidades e desfaz a de uma delas', async () => {
    const { onRemover, onAbrir } = montar({
      unidades: [
        { id: 'u-1', nome: 'PRN TELE_ARARAQUARA' },
        { id: 'u-2', nome: 'PRN TELE_MARABA' },
      ],
    });

    const lista = screen.getByRole('list', { name: 'Unidades' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'PRN TELE_MARABA' }));
    expect(onAbrir).toHaveBeenCalledWith('u-2');
    await userEvent.click(
      screen.getByRole('button', { name: 'Desfazer a unificação de PRN TELE_ARARAQUARA' }),
    );
    expect(onRemover).toHaveBeenCalledWith('u-1');
  });

  it('unifica outro cliente escolhido pela busca', async () => {
    const { onAdicionar } = montar();

    expect(screen.getByText(/Nenhuma unidade/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('combobox', { name: 'Unificar cliente' }), 'cedi');
    await userEvent.click(await screen.findByRole('option', { name: 'CEDI_RJ' }));

    expect(onAdicionar).toHaveBeenCalledWith('cl-cedi');
  });

  it('na unidade, diz de quem ela é e deixa desfazer', async () => {
    const { onDesfazer, onAbrir } = montar({ unificadoEm: { id: 'cl-prn', nome: 'PRN' } });

    expect(screen.getByText(/Os laudos deste cliente são do/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'PRN' }));
    expect(onAbrir).toHaveBeenCalledWith('cl-prn');
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer unificação' }));
    expect(onDesfazer).toHaveBeenCalled();
  });

  it('mostra o motivo quando a API recusa', async () => {
    montar({
      onAdicionar: vi.fn(async () => {
        throw new ResponseError({
          data: { message: 'PRN tem unidades próprias: desfaça essas unificações antes.' },
          status: 400,
          statusText: '',
          request: new Request('http://api.test/catalogo/clientes'),
          response: new Response(),
        } as never);
      }),
    });

    await userEvent.type(screen.getByRole('combobox', { name: 'Unificar cliente' }), 'cedi');
    await userEvent.click(await screen.findByRole('option', { name: 'CEDI_RJ' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('PRN tem unidades próprias');
  });

  it('sem permissão de editar, só mostra', () => {
    montar({
      podeCriar: false,
      podeExcluir: false,
      unidades: [{ id: 'u-1', nome: 'PRN TELE_ARARAQUARA' }],
    });

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Desfazer/ })).not.toBeInTheDocument();
  });
});
