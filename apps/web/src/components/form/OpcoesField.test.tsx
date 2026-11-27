import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { useAppForm } from './form';

const schema = z.object({ modo: z.string().min(1, 'Escolha o modo.') });

function Formulario({
  modo = '',
  aoEnviar = vi.fn(),
}: {
  modo?: string;
  aoEnviar?: (v: string) => void;
}) {
  const form = useAppForm({
    defaultValues: { modo },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => aoEnviar(value.modo),
  });
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="modo">
        {(field) => (
          <field.OpcoesField
            label="Modo"
            required
            opcoes={[
              { valor: 'sla', rotulo: 'Segue o SLA', ajuda: 'Recebe pelo prazo.' },
              { valor: 'nao', rotulo: 'Não recebe' },
            ]}
          />
        )}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton pendingLabel="Salvando…">Salvar</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

describe('OpcoesField', () => {
  it('mostra o título, as opções e a ajuda de cada uma', () => {
    render(<Formulario />);
    expect(screen.getByRole('radiogroup', { name: 'Modo' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Segue o SLA' })).toBeInTheDocument();
    expect(screen.getByText('Recebe pelo prazo.')).toBeInTheDocument();
  });

  it('envia o valor da opção marcada', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario modo="sla" aoEnviar={aoEnviar} />);
    expect(screen.getByRole('radio', { name: 'Segue o SLA' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Não recebe' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith('nao'));
  });

  it('sem escolha, o envio mostra o erro e põe o foco na primeira opção', async () => {
    render(<Formulario />);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Escolha o modo.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Segue o SLA' })).toHaveFocus());
  });
});
