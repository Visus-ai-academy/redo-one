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

function FormularioFaixa({ onSubmit }: { onSubmit: (valores: { minutos: string }) => void }) {
  const form = useAppForm({
    defaultValues: { minutos: '30' },
    validators: { onSubmit: z.object({ minutos: z.string() }) },
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
      <form.AppField name="minutos">
        {(field) => (
          <field.NumberField label="Minutos" placeholder="30" min={1} max={1440} required />
        )}
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
    await userEvent.type(screen.getByRole('textbox', { name: 'Ordem' }), '3');
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
    expect(screen.getByRole('textbox', { name: 'Ordem' })).toBeRequired();
  });

  it('número: ignora letras e mostra números grandes sem separador de milhar', async () => {
    const onSubmit = vi.fn();
    render(<Formulario onSubmit={onSubmit} />);

    const ordem = screen.getByRole('textbox', { name: 'Ordem' });
    await userEvent.type(ordem, 'a990001');
    await userEvent.tab();
    expect(ordem).toHaveValue('990001');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ ordem: '990001' }));
  });

  describe('fora da faixa (min/max)', () => {
    it('não corrige sozinho para o limite: mostra o erro e não envia', async () => {
      const onSubmit = vi.fn();
      render(<FormularioFaixa onSubmit={onSubmit} />);
      const minutos = screen.getByRole('textbox', { name: 'Minutos' });

      await userEvent.clear(minutos);
      await userEvent.type(minutos, '2000');
      await userEvent.tab();

      expect(minutos).toHaveValue('2000');
      expect(await screen.findByText('Use um valor entre 1 e 1440.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('o erro some ao voltar para a faixa, e aí envia', async () => {
      const onSubmit = vi.fn();
      render(<FormularioFaixa onSubmit={onSubmit} />);
      const minutos = screen.getByRole('textbox', { name: 'Minutos' });

      await userEvent.clear(minutos);
      await userEvent.type(minutos, '0');
      await userEvent.tab();
      expect(await screen.findByText('Use um valor entre 1 e 1440.')).toBeInTheDocument();

      await userEvent.clear(minutos);
      await userEvent.type(minutos, '45');
      await userEvent.tab();
      expect(screen.queryByText('Use um valor entre 1 e 1440.')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      expect(onSubmit).toHaveBeenCalledWith({ minutos: '45' });
    });
  });
});
