import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { esquemaCaixasComTodas, TODAS } from '../form/caixas-todas';
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

const esquemaTodos = z.object({ dias: esquemaCaixasComTodas('Marque ao menos um dia.') });

function FormularioTodos({
  dias = [TODAS],
  aoEnviar = () => {},
}: {
  dias?: string[];
  aoEnviar?: (v: string[]) => void;
}) {
  const form = useAppForm({
    defaultValues: { dias },
    validators: { onSubmit: esquemaTodos },
    onSubmit: ({ value }) => aoEnviar(value.dias),
  });
  return (
    <form
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="dias">
        {() => (
          <CaixasField
            label="Dias"
            required
            todas="Todos os dias"
            opcoes={[
              { valor: '1', rotulo: 'Seg' },
              { valor: '2', rotulo: 'Ter' },
              { valor: '3', rotulo: 'Qua' },
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

describe('CaixasField com "Todas"', () => {
  it('"Todos os dias" marcada mostra e todas as caixas marcadas', () => {
    render(<FormularioTodos />);
    expect(screen.getByRole('checkbox', { name: 'Todos os dias' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Seg' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Qua' })).toBeChecked();
  });

  it('desmarcar uma deixa as demais e "Todos os dias" fica meio marcada', async () => {
    const aoEnviar = vi.fn();
    render(<FormularioTodos aoEnviar={aoEnviar} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ter' }));
    expect(screen.getByRole('checkbox', { name: 'Todos os dias' })).toHaveAttribute(
      'aria-checked',
      'mixed',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith(['1', '3']));
  });

  it('marcar uma a uma todas vira "Todos os dias" (`[TODAS]`)', async () => {
    const aoEnviar = vi.fn();
    render(<FormularioTodos dias={['1']} aoEnviar={aoEnviar} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ter' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Qua' }));
    expect(screen.getByRole('checkbox', { name: 'Todos os dias' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith([TODAS]));
  });

  it('desmarcar "Todos os dias" desmarca tudo e mostra o erro, sem enviar', async () => {
    const aoEnviar = vi.fn();
    render(<FormularioTodos aoEnviar={aoEnviar} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Todos os dias' }));
    expect(screen.getByRole('checkbox', { name: 'Seg' })).not.toBeChecked();
    expect(await screen.findByText('Marque ao menos um dia.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(aoEnviar).not.toHaveBeenCalled();
  });
});
