import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { esquemaCaixasComTodas } from './caixas-todas';
import { useAppForm } from './form';

const schema = z.object({ escalas: esquemaCaixasComTodas('Marque ao menos uma escala.') });

function Formulario({
  escalas = [],
  aoEnviar = () => {},
}: {
  escalas?: string[];
  aoEnviar?: (v: string[]) => void;
}) {
  const form = useAppForm({
    defaultValues: { escalas },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => aoEnviar(value.escalas),
  });
  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="escalas">
        {(field) => (
          <field.CheckboxListField
            label="Escalas"
            todas="Todas"
            opcoes={[
              { valor: 'a', rotulo: 'Tomografia' },
              { valor: 'b', rotulo: 'Ressonância' },
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

describe('CheckboxListField com "Todas"', () => {
  it('valor vazio mostra "Todas" e as opções marcadas', () => {
    render(<Formulario />);
    expect(screen.getByRole('checkbox', { name: 'Todas' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Tomografia' })).toBeChecked();
  });

  it('desmarcar uma envia a outra', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario aoEnviar={aoEnviar} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tomografia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith(['b']));
  });

  it('marcar todas uma a uma envia vazio ("Todas")', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario escalas={['a']} aoEnviar={aoEnviar} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ressonância' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith([]));
  });

  it('desmarcar "Todas" mostra o erro e não envia', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario aoEnviar={aoEnviar} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Todas' }));
    expect(await screen.findByText('Marque ao menos uma escala.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(aoEnviar).not.toHaveBeenCalled();
  });
});
