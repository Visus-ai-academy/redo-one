import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { DateField } from './DateField';
import { useAppForm } from './form';

function Formulario({
  required,
  onSalvar = () => {},
}: {
  required?: boolean;
  onSalvar?: (valor: { inicio: string }) => void;
}) {
  const form = useAppForm({
    defaultValues: { inicio: '' },
    validators: { onSubmit: z.object({ inicio: z.string().min(1, 'Informe o início.') }) },
    onSubmit: ({ value }) => onSalvar(value),
  });
  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="inicio">
        {() => (
          <DateField label="Início" required={required} description="Primeiro dia da ausência." />
        )}
      </form.AppField>
      <button type="submit">Salvar</button>
    </form>
  );
}

describe('DateField', () => {
  it('liga o rótulo ao campo e marca o obrigatório com *', () => {
    render(<Formulario required />);
    const campo = screen.getByLabelText('Início');
    expect(campo).toBeRequired();
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Primeiro dia da ausência.')).toBeInTheDocument();
  });

  it('grava a data no formato AAAA-MM-DD', async () => {
    const onSalvar = vi.fn();
    render(<Formulario onSalvar={onSalvar} />);
    await userEvent.type(screen.getByLabelText('Início'), '01122026');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar).toHaveBeenCalledWith({ inicio: '2026-12-01' });
  });

  it('mostra o erro do schema ao enviar vazio', async () => {
    render(<Formulario required />);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Informe o início.')).toBeInTheDocument();
    expect(screen.getByLabelText('Início')).toHaveAttribute('aria-invalid', 'true');
  });
});
