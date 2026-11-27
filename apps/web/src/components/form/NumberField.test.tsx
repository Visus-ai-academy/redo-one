import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { useAppForm } from './form';

function Formulario({
  inicial,
  aoEnviar = vi.fn(),
}: {
  inicial: string;
  aoEnviar?: (v: string) => void;
}) {
  const form = useAppForm({
    defaultValues: { percentual: inicial },
    onSubmit: ({ value }) => aoEnviar(value.percentual),
  });
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="percentual">
        {(field) => (
          <field.NumberField label="Percentual" placeholder="0" step={0.01} max={100} unidade="%" />
        )}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton pendingLabel="Salvando…">Salvar</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

describe('NumberField com unidade', () => {
  it('mostra a unidade fixa ao lado do número, fora do nome do campo', () => {
    render(<Formulario inicial="12.5" />);
    expect(screen.getByText('%')).toHaveAttribute('aria-hidden');
    expect(screen.getByRole('textbox', { name: 'Percentual' })).toHaveValue('12,5');
  });

  it('sem mexer, devolve o mesmo valor', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario inicial="12.5" aoEnviar={aoEnviar} />);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith('12.5'));
  });

  it('digitado com vírgula, guarda com ponto', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario inicial="" aoEnviar={aoEnviar} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Percentual' }), '7,25');
    await userEvent.tab();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith('7.25'));
  });
});
