import { Button } from '@base-ui/react/button';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Dialogo } from './Dialogo';

function montar({ alterado = false } = {}) {
  const onFechar = vi.fn();
  const onEnviar = vi.fn();
  render(
    <Dialogo
      titulo="Novo nível"
      descricao="O nível aparece no cadastro do médico."
      alterado={alterado}
      onFechar={onFechar}
      onEnviar={onEnviar}
      acao={<Button type="submit">Criar nível</Button>}
    >
      <input aria-label="Nome" />
      <input aria-label="Ordem" />
    </Dialogo>,
  );
  return { onFechar, onEnviar };
}

describe('Dialogo', () => {
  it('abre com o título como nome e a descrição', async () => {
    montar();

    const dialogo = await screen.findByRole('dialog', { name: 'Novo nível' });
    expect(dialogo).toHaveAccessibleDescription('O nível aparece no cadastro do médico.');
  });

  it('480px no computador, raio de 12px', async () => {
    montar();

    expect(await screen.findByRole('dialog')).toHaveClass('sm:w-[480px]', 'sm:rounded-xl');
  });

  it('entra animando (esmaece e cresce)', async () => {
    montar();

    const dialogo = await screen.findByRole('dialog');
    await waitFor(() => expect(dialogo).toHaveAttribute('data-open'));
    expect(dialogo).toHaveClass('transition-[opacity,scale]', 'motion-reduce:transition-none');
  });

  it('o foco começa no primeiro campo', async () => {
    montar();

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveFocus());
  });

  it('rodapé com Cancelar e a ação à direita; Enter num campo envia', async () => {
    const { onEnviar } = montar();

    const cancelar = await screen.findByRole('button', { name: 'Cancelar' });
    const criar = screen.getByRole('button', { name: 'Criar nível' });
    expect(cancelar.compareDocumentPosition(criar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.type(screen.getByRole('textbox', { name: 'Nome' }), 'Nível 2{Enter}');
    expect(onEnviar).toHaveBeenCalledTimes(1);
  });

  it('Cancelar fecha, e quem usa só fica sabendo depois da animação', async () => {
    const { onFechar } = montar();

    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1));
  });

  it('Esc fecha', async () => {
    const { onFechar } = montar();

    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1));
  });

  it('com alterações, fechar pergunta; "Continuar editando" mantém o diálogo', async () => {
    const { onFechar } = montar({ alterado: true });

    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await userEvent.click(
      await within(
        await screen.findByRole('alertdialog', { name: 'Descartar as alterações?' }),
      ).findByRole('button', { name: 'Continuar editando' }),
    );

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Novo nível' })).toBeInTheDocument();
    expect(onFechar).not.toHaveBeenCalled();
  });

  it('com alterações, Esc pergunta e "Descartar" fecha', async () => {
    const { onFechar } = montar({ alterado: true });

    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));

    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1));
  });
});
