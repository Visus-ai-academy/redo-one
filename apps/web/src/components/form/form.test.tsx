import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { useAppForm } from './form';

const schema = z.object({ email: z.email('E-mail inválido') });

function SignupForm({ onSubmit }: { onSubmit: (value: z.infer<typeof schema>) => void }) {
  const form = useAppForm({
    defaultValues: { email: '' },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => onSubmit(value),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="email">
        {(field) => <field.TextField label="E-mail" placeholder="nome@empresa.com.br" />}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton>Enviar</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

describe('useAppForm', () => {
  it('mostra o erro do schema Zod e não envia dados inválidos', async () => {
    const onSubmit = vi.fn();
    render(<SignupForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('E-mail'), 'invalido');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('E-mail inválido')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envia os valores quando o formulário é válido', async () => {
    const onSubmit = vi.fn();
    render(<SignupForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('E-mail'), 'ada@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(onSubmit).toHaveBeenCalledWith({ email: 'ada@example.com' });
  });
});
