import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { erroDoPeriodo, type ValorPeriodo } from '../periodo/periodo';
import { useAppForm } from './form';

const schema = z.object({
  periodo: z
    .object({ de: z.string(), ate: z.string() })
    .refine((p) => p.de !== '' && p.ate !== '', 'Informe o início e o fim.')
    .refine((p) => !erroDoPeriodo(p), 'O fim não pode ser antes do início.'),
});

function Formulario({
  inicial,
  aoEnviar = vi.fn(),
}: {
  inicial: ValorPeriodo;
  aoEnviar?: (v: ValorPeriodo) => void;
}) {
  const form = useAppForm({
    defaultValues: { periodo: inicial },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => aoEnviar(value.periodo),
  });
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="periodo">
        {(field) => <field.PeriodoField label="Vigência" required />}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton pendingLabel="Salvando…">Salvar</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

describe('PeriodoField', () => {
  it('mostra De e Até com os dias que vieram e devolve iguais', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario inicial={{ de: '2026-12-01', ate: '2026-12-31' }} aoEnviar={aoEnviar} />);
    expect(screen.getByLabelText('De')).toHaveValue('01/12/2026');
    expect(screen.getByLabelText('Até')).toHaveValue('31/12/2026');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(aoEnviar).toHaveBeenCalledWith({ de: '2026-12-01', ate: '2026-12-31' }),
    );
  });

  it('fim antes do início mostra o erro e não envia', async () => {
    const aoEnviar = vi.fn();
    render(<Formulario inicial={{ de: '', ate: '' }} aoEnviar={aoEnviar} />);
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '10/12/2026' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '05/12/2026' } });
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('O fim não pode ser antes do início.')).toBeInTheDocument();
    expect(aoEnviar).not.toHaveBeenCalled();
  });
});

describe('erroDoPeriodo', () => {
  it('só reclama com as duas datas e o fim antes', () => {
    expect(erroDoPeriodo({ de: '2026-12-10', ate: '2026-12-05' })).toBeTruthy();
    expect(erroDoPeriodo({ de: '2026-12-05', ate: '2026-12-05' })).toBeUndefined();
    expect(erroDoPeriodo({ de: '', ate: '2026-12-05' })).toBeUndefined();
  });
});
