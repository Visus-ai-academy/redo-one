import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { useAppForm } from './form';

const schema = z.object({ tipo: z.string().min(1, 'Escolha o tipo.') });

function Formulario({
  tipo = '',
  aoEnviar = vi.fn(),
}: {
  tipo?: string;
  aoEnviar?: (v: string) => void;
}) {
  const form = useAppForm({
    defaultValues: { tipo },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => aoEnviar(value.tipo),
  });
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="tipo">
        {(field) => (
          <field.SegmentadaField
            label="Tipo"
            required
            opcoes={[
              { valor: 'receita', rotulo: 'Receita' },
              { valor: 'despesa', rotulo: 'Despesa' },
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

describe('SegmentadaField', () => {
  it('o grupo leva o nome do campo e marca a opção atual', () => {
    render(<Formulario tipo="despesa" />);
    expect(screen.getByRole('group', { name: 'Tipo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Despesa' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('troca e envia o valor escolhido', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario tipo="despesa" aoEnviar={aoEnviar} />);
    await userEvent.click(screen.getByRole('button', { name: 'Receita' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith('receita'));
  });

  it('as setas do teclado andam entre as opções', async () => {
    render(<Formulario tipo="receita" />);
    screen.getByRole('button', { name: 'Receita' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'Despesa' })).toHaveFocus();
  });

  it('sem escolha, o envio mostra o erro e põe o foco na primeira opção', async () => {
    render(<Formulario />);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Escolha o tipo.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Receita' })).toHaveFocus());
  });
});
