import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { escolherOpcao } from '../../test/select';
import { useAppForm } from './form';

function Formulario({ onSubmit }: { onSubmit: (valores: { papelId: string }) => void }) {
  const form = useAppForm({
    defaultValues: { papelId: '' },
    validators: { onSubmit: z.object({ papelId: z.string().min(1, 'Escolha o papel.') }) },
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
      <form.AppField name="papelId">
        {(field) => (
          <field.SelectField
            label="Papel"
            placeholder="Escolha um papel"
            required
            description="Aparecem só papéis com permissões que você também tem."
            opcoes={[{ valor: 'p-fin', rotulo: 'Financeiro' }]}
          />
        )}
      </form.AppField>
      <button type="submit">Enviar</button>
    </form>
  );
}

describe('SelectField', () => {
  it('tem rótulo com *, ajuda ligada ao campo e placeholder', () => {
    render(<Formulario onSubmit={vi.fn()} />);

    const campo = screen.getByRole('combobox', { name: 'Papel' });
    expect(campo).toHaveTextContent('Escolha um papel');
    expect(campo).toHaveAccessibleDescription(
      'Aparecem só papéis com permissões que você também tem.',
    );
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
  });

  it('mostra o erro do schema e não envia sem escolher', async () => {
    const onSubmit = vi.fn();
    render(<Formulario onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Escolha o papel.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Papel' })).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envia a opção escolhida', async () => {
    const onSubmit = vi.fn();
    render(<Formulario onSubmit={onSubmit} />);

    await escolherOpcao('Papel', 'Financeiro');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(onSubmit).toHaveBeenCalledWith({ papelId: 'p-fin' });
  });
});
