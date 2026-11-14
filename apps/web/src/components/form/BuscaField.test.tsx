import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { useAppForm } from './form';

function Formulario({ onSubmit }: { onSubmit: (v: { exame: OpcaoBusca | null }) => void }) {
  const form = useAppForm({
    defaultValues: { exame: null as OpcaoBusca | null },
    validators: {
      onSubmit: z.object({
        exame: z.custom<OpcaoBusca | null>((v) => v !== null, 'Escolha o exame.'),
      }),
    },
    onSubmit: ({ value }) => onSubmit(value),
  });
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="exame">
        {(field) => (
          <field.BuscaField
            label="Exame de destino"
            placeholder="Digite o nome do exame"
            required
            chave="exames"
            buscar={async () => [{ valor: 'e-1', rotulo: 'TC ABDOME' }]}
          />
        )}
      </form.AppField>
      <button type="submit">Salvar</button>
    </form>
  );
}

describe('BuscaField', () => {
  it('tem rótulo com *, mostra o erro e envia a opção escolhida', async () => {
    const onSubmit = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Formulario onSubmit={onSubmit} />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Escolha o exame.')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('combobox', { name: 'Exame de destino' }), 'tc');
    await userEvent.click(await screen.findByRole('option', { name: 'TC ABDOME' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSubmit).toHaveBeenCalledWith({ exame: { valor: 'e-1', rotulo: 'TC ABDOME' } });
  });
});
