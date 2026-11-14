import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PainelLateral } from './PainelLateral';

function montar() {
  const onFechar = vi.fn();
  const naLista = vi.fn();
  render(
    <>
      <button type="button" onClick={naLista}>
        Linha da lista
      </button>
      <PainelLateral titulo="Ana Reis" subtitulo="ana@clinica.com" onFechar={onFechar}>
        <input aria-label="Nome" />
      </PainelLateral>
    </>,
  );
  return { onFechar, naLista };
}

describe('PainelLateral', () => {
  it('é um drawer com o título como nome', async () => {
    montar();

    const painel = await screen.findByRole('dialog', { name: 'Ana Reis' });
    expect(painel).toHaveTextContent('ana@clinica.com');
    expect(screen.getByRole('textbox', { name: 'Nome' })).toBeInTheDocument();
  });

  it('fecha pelo botão e pelo Esc', async () => {
    const { onFechar } = montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Fechar painel' }));
    expect(onFechar).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('textbox', { name: 'Nome' }));
    await userEvent.keyboard('{Escape}');
    expect(onFechar).toHaveBeenCalledTimes(2);
  });

  it('não bloqueia a lista: clicar fora não fecha e a lista responde', async () => {
    const { onFechar, naLista } = montar();
    await screen.findByRole('dialog', { name: 'Ana Reis' });

    await userEvent.click(screen.getByRole('button', { name: 'Linha da lista' }));

    expect(naLista).toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
  });
});
