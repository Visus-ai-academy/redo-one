import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmarAcao } from './ConfirmarAcao';

function montar(onConfirmar = vi.fn(async () => {})) {
  render(
    <ConfirmarAcao
      acao="Desativar usuário"
      titulo="Desativar Maria Souza?"
      consequencia="A pessoa perde o acesso na hora."
      onConfirmar={onConfirmar}
    />,
  );
  return onConfirmar;
}

describe('ConfirmarAcao', () => {
  it('abre a confirmação dizendo a consequência, com o foco no Cancelar', async () => {
    const onConfirmar = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Desativar usuário' }));

    const dialogo = await screen.findByRole('alertdialog', { name: 'Desativar Maria Souza?' });
    expect(dialogo).toHaveAccessibleDescription('A pessoa perde o acesso na hora.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus());
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('cancelar fecha sem fazer nada', async () => {
    const onConfirmar = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Desativar usuário' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('confirmar executa a ação, com o mesmo nome do botão, e fecha', async () => {
    const onConfirmar = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Desativar usuário' }));
    const dialogo = await screen.findByRole('alertdialog');
    const botoes = screen.getAllByRole('button', { name: 'Desativar usuário' });
    await userEvent.click(botoes.find((b) => dialogo.contains(b)) as HTMLElement);

    expect(onConfirmar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('controlado e sem botão próprio: abre pelo `aberto`, com os rótulos do caso', async () => {
    const onConfirmar = vi.fn();
    const onAbertoChange = vi.fn();
    render(
      <ConfirmarAcao
        acao="Descartar"
        rotuloCancelar="Continuar editando"
        titulo="Descartar as alterações?"
        consequencia="O que você mudou neste formulário se perde."
        onConfirmar={onConfirmar}
        aberto
        onAbertoChange={onAbertoChange}
      />,
    );

    const dialogo = await screen.findByRole('alertdialog', { name: 'Descartar as alterações?' });
    expect(dialogo).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continuar editando' })).toHaveFocus(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(onAbertoChange).toHaveBeenCalledWith(false);
    expect(onConfirmar).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });

  it('fica acima de painel lateral e diálogo (que estão em z-40 e z-50)', async () => {
    montar();

    await userEvent.click(screen.getByRole('button', { name: 'Desativar usuário' }));

    expect(await screen.findByRole('alertdialog')).toHaveClass('z-50');
  });
});
