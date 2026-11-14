import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { useAppForm } from './form';

type Valores = { ativo: boolean; observacoes: string; ordem: string };

function Formulario({ onSubmit }: { onSubmit: (valores: Valores) => void }) {
  const form = useAppForm({
    defaultValues: { ativo: true, observacoes: '', ordem: '' } as Valores,
    validators: {
      onSubmit: z.object({
        ativo: z.boolean(),
        observacoes: z.string(),
        ordem: z.string().regex(/^\d+$/, 'Informe um número inteiro.'),
      }),
    },
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
          <field.CheckboxField label="Ativo" description="Inativo some das listas de escolha." />
        )}
      </form.AppField>
      <form.AppField name="observacoes">
        {(field) => <field.TextAreaField label="Observações" placeholder="Ex.: por que existe" />}
      </form.AppField>
      <form.AppField name="ordem">
        {(field) => <field.NumberField label="Ordem" placeholder="0" required />}
      </form.AppField>
      <button type="submit">Salvar</button>
    </form>
  );
}

describe('campos de caixa de marcar, texto longo e número', () => {
  it('enviam os valores digitados', async () => {
    const onSubmit = vi.fn();
    render(<Formulario onSubmit={onSubmit} />);

    const ativo = screen.getByRole('checkbox', { name: 'Ativo' });
    expect(ativo).toHaveAccessibleDescription('Inativo some das listas de escolha.');
    await userEvent.click(ativo);
    await userEvent.type(screen.getByRole('textbox', { name: 'Observações' }), 'Unidade nova');
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Ordem' }), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSubmit).toHaveBeenCalledWith({
      ativo: false,
      observacoes: 'Unidade nova',
      ordem: '3',
    });
  });

  it('mostram o erro abaixo do campo', async () => {
    render(<Formulario onSubmit={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Informe um número inteiro.')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Ordem' })).toBeRequired();
  });
});
