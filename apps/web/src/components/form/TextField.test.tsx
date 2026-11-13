import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { useAppForm } from './form';

function Formulario({ required }: { required?: boolean }) {
  const form = useAppForm({
    defaultValues: { nome: '' },
    validators: { onSubmit: z.object({ nome: z.string().min(1, 'Informe o nome.') }) },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="nome">
        {(field) => (
          <field.TextField
            label="Nome"
            placeholder="Ex.: Maria Souza"
            required={required}
            description="Como aparece no menu."
          />
        )}
      </form.AppField>
      <button type="submit">Salvar</button>
    </form>
  );
}

describe('TextField', () => {
  it('marca o campo obrigatório com * escondido do leitor de tela e o atributo required', () => {
    render(<Formulario required />);

    const campo = screen.getByRole('textbox', { name: 'Nome' });
    expect(campo).toBeRequired();
    const asterisco = screen.getByText('*');
    expect(asterisco).toHaveAttribute('aria-hidden', 'true');
  });

  it('não mostra * em campo opcional', () => {
    render(<Formulario />);

    expect(screen.getByRole('textbox', { name: 'Nome' })).not.toBeRequired();
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('mostra o placeholder e a ajuda ligada ao campo', () => {
    render(<Formulario />);

    const campo = screen.getByRole('textbox', { name: 'Nome' });
    expect(campo).toHaveAttribute('placeholder', 'Ex.: Maria Souza');
    expect(campo).toHaveAccessibleDescription('Como aparece no menu.');
  });

  it('mostra o erro abaixo do campo e marca o campo como inválido', async () => {
    render(<Formulario required />);

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Informe o nome.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveAttribute('aria-invalid', 'true');
  });
});
