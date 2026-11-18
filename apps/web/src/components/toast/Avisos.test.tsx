import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Avisos } from './Avisos';
import { useAvisos } from './use-avisos';

function Salvar() {
  const avisos = useAvisos();
  return (
    <button type="button" onClick={() => avisos.sucesso('Dados salvos.')}>
      Salvar
    </button>
  );
}

const desfazer = vi.fn();
function Tirar() {
  const avisos = useAvisos();
  return (
    <button
      type="button"
      onClick={() =>
        avisos.sucesso('Exame tirado da proposta.', {
          acao: { rotulo: 'Desfazer', onClick: desfazer },
        })
      }
    >
      Tirar
    </button>
  );
}

describe('Avisos', () => {
  it('confirma o sucesso num toast que se anuncia ao leitor de tela e some sozinho', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <Avisos>
        <Salvar />
      </Avisos>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Dados salvos.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Avisos' })).toHaveTextContent('Dados salvos.');
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(screen.queryByText('Dados salvos.')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('a faixa dos avisos não bloqueia cliques no que está embaixo; só o aviso é clicável', async () => {
    render(
      <Avisos>
        <Salvar />
      </Avisos>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const aviso = await screen.findByText('Dados salvos.');

    const regiao = screen.getByRole('region', { name: 'Avisos' });
    expect(regiao).toHaveClass('pointer-events-none');
    expect(regiao).toHaveAttribute('data-avisos');
    expect(aviso.closest('[data-avisos] > *')).toHaveClass('pointer-events-auto');
  });

  it('fecha pelo botão', async () => {
    render(
      <Avisos>
        <Salvar />
      </Avisos>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    // O Base UI só expõe o fechar ao leitor de tela quando o toast recebe foco.
    await userEvent.click(await screen.findByLabelText('Fechar aviso'));

    await vi.waitFor(() => expect(screen.queryByText('Dados salvos.')).not.toBeInTheDocument());
  });

  it('aviso com ação (ex.: "Desfazer"): o clique roda a ação e fecha o aviso', async () => {
    desfazer.mockClear();
    render(
      <Avisos>
        <Tirar />
      </Avisos>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Tirar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    expect(desfazer).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(screen.queryByText('Exame tirado da proposta.')).not.toBeInTheDocument(),
    );
  });
});
