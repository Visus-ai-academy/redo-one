import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { useAppForm } from './form';

function Formulario({ onSubmit }: { onSubmit: (valores: { ativo: boolean }) => void }) {
  const form = useAppForm({
    defaultValues: { ativo: true },
    validators: { onSubmit: z.object({ ativo: z.boolean() }) },
    onSubmit: ({ value }) => onSubmit(value),
  });
  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="ativo">
        {(field) => (
          <field.InterruptorField label="Ativo" description="Inativo some das listas de escolha." />
        )}
      </form.AppField>
      <button type="submit">Salvar</button>
    </form>
  );
}

describe('InterruptorField', () => {
  it('é um interruptor com o rótulo e a descrição, e envia o valor desligado', async () => {
    const onSubmit = vi.fn();
    render(<Formulario onSubmit={onSubmit} />);

    const ativo = screen.getByRole('switch', { name: 'Ativo' });
    expect(ativo).toBeChecked();
    expect(ativo).toHaveAccessibleDescription('Inativo some das listas de escolha.');
    await userEvent.click(screen.getByText('Ativo'));
    expect(ativo).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSubmit).toHaveBeenCalledWith({ ativo: false });
  });

  it('liga e desliga pelo teclado, com a barra de espaço', async () => {
    const onSubmit = vi.fn();
    render(<Formulario onSubmit={onSubmit} />);

    const ativo = screen.getByRole('switch', { name: 'Ativo' });
    ativo.focus();
    await userEvent.keyboard(' ');
    expect(ativo).not.toBeChecked();
    await userEvent.keyboard(' ');
    expect(ativo).toBeChecked();
  });
});
