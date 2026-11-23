import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { useAppForm } from '../form/form';
import { CaixasField } from './campos';

const schema = z.object({
  nome: z.string(),
  dias: z.array(z.string()).min(1, 'Marque ao menos um dia.'),
});

function Formulario({ dias = [] }: { dias?: string[] }) {
  const form = useAppForm({
    defaultValues: { nome: '', dias },
    validators: { onSubmit: schema },
    onSubmit: () => {},
  });
  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="nome">
        {(field) => <field.TextField label="Nome" placeholder="Ex.: Ana" />}
      </form.AppField>
      <form.AppField name="dias">
        {() => (
          <CaixasField
            label="Dias"
            required
            opcoes={[
              { valor: '1', rotulo: 'Seg' },
              { valor: '2', rotulo: 'Ter' },
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

describe('CaixasField', () => {
  it('ao enviar com erro, mostra o erro e põe o foco na primeira caixa', async () => {
    render(<Formulario />);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Marque ao menos um dia.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Seg' })).toHaveFocus();
  });

  it('desmarcar a última mostra o erro, e ele some ao marcar de novo', async () => {
    render(<Formulario dias={['1']} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seg' }));
    expect(await screen.findByText('Marque ao menos um dia.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ter' }));
    expect(screen.queryByText('Marque ao menos um dia.')).not.toBeInTheDocument();
  });
});
