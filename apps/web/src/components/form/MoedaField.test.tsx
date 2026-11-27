import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { useAppForm } from './form';

function Formulario({
  inicial = null,
  negativo = false,
  aoEnviar = vi.fn(),
}: {
  inicial?: number | null;
  negativo?: boolean;
  aoEnviar?: (v: number | null) => void;
}) {
  const form = useAppForm({
    defaultValues: { valor: inicial as number | null },
    onSubmit: ({ value }) => aoEnviar(value.valor),
  });
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="valor">
        {(field) => <field.MoedaField label="Valor" negativo={negativo} />}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton pendingLabel="Salvando…">Salvar</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

describe('MoedaField', () => {
  it('mostra os centavos que vieram da API com duas casas e o R$ fixo', () => {
    render(<Formulario inicial={123456} />);
    expect(screen.getByRole('textbox', { name: 'Valor' })).toHaveValue('1.234,56');
    expect(screen.getByText('R$')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Valor' })).toHaveAttribute('inputmode', 'decimal');
  });

  it('formata enquanto digita e envia em centavos inteiros', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario aoEnviar={aoEnviar} />);
    const campo = screen.getByRole('textbox', { name: 'Valor' });
    await userEvent.type(campo, '1234,5');
    expect(campo).toHaveValue('1.234,5');
    await userEvent.tab();
    expect(campo).toHaveValue('1.234,50');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith(123450));
  });

  it('sem mexer, devolve exatamente o valor que veio', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario inicial={29} aoEnviar={aoEnviar} />);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith(29));
  });

  it('apagar tudo deixa o valor vazio (null)', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario inicial={500} aoEnviar={aoEnviar} />);
    await userEvent.clear(screen.getByRole('textbox', { name: 'Valor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith(null));
  });

  it('com negativo, aceita o sinal de menos', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario negativo aoEnviar={aoEnviar} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Valor' }), '-12,3');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith(-1230));
  });

  it('sem negativo, o sinal de menos é ignorado', async () => {
    render(<Formulario />);
    const campo = screen.getByRole('textbox', { name: 'Valor' });
    await userEvent.type(campo, '-12');
    expect(campo).toHaveValue('12');
  });
});
