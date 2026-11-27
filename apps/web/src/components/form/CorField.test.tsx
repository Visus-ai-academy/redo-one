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
    defaultValues: { cor: inicial },
    onSubmit: ({ value }) => aoEnviar(value.cor),
  });
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="cor">{(field) => <field.CorField />}</form.AppField>
      <form.AppForm>
        <form.SubmitButton pendingLabel="Salvando…">Salvar</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

describe('CorField', () => {
  it('oferece "Sem cor" e as 14 cores da paleta, cada uma com nome', () => {
    render(<Formulario inicial="" />);
    expect(screen.getAllByRole('radio')).toHaveLength(15);
    expect(screen.getByRole('radio', { name: 'Sem cor' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Verde' })).toBeInTheDocument();
  });

  it('escolher uma cor envia o hex da paleta', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario inicial="" aoEnviar={aoEnviar} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Roxo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith('#8462A8'));
  });

  it('cor gravada em minúscula marca a da paleta e volta igual sem mexer', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario inicial="#c0525e" aoEnviar={aoEnviar} />);
    expect(screen.getByRole('radio', { name: 'Vermelho' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith('#c0525e'));
  });

  it('cor de fora da paleta aparece como "Cor atual" e não se perde', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario inicial="#1F7A4D" aoEnviar={aoEnviar} />);
    expect(screen.getByRole('radio', { name: 'Cor atual (#1F7A4D)' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith('#1F7A4D'));
  });

  it('"Sem cor" limpa', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario inicial="#5A9A64" aoEnviar={aoEnviar} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Sem cor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith(''));
  });
});
