import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { BuscaMultiplaField } from './BuscaMultiplaField';
import { useAppForm } from './form';

const ana = { valor: 'c-ana', rotulo: 'Clínica Ana' };
const beta = { valor: 'c-beta', rotulo: 'Hospital Beta' };

function Formulario({
  iniciais,
  onEnviar,
  buscar = async () => [ana, beta],
  exigir = false,
}: {
  iniciais: OpcaoBusca[];
  onEnviar: (ids: string[]) => void;
  buscar?: (termo: string) => Promise<OpcaoBusca[]>;
  exigir?: boolean;
}) {
  const form = useAppForm({
    defaultValues: { clientes: iniciais },
    validators: {
      onSubmit: ({ value }) =>
        exigir && value.clientes.length === 0
          ? { fields: { clientes: 'Escolha ao menos um cliente.' } }
          : undefined,
    },
    onSubmit: ({ value }) => onEnviar(value.clientes.map((c) => c.valor)),
  });
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="clientes">
        {() => (
          <BuscaMultiplaField
            label="Clientes de fora"
            placeholder="Digite o nome do cliente"
            chave="clientes"
            buscar={buscar}
            required={exigir}
          />
        )}
      </form.AppField>
      <button type="submit">Salvar</button>
    </form>
  );
}

const montar = (props: Parameters<typeof Formulario>[0]) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Formulario {...props} />
    </QueryClientProvider>,
  );

describe('BuscaMultiplaField', () => {
  it('um campo só: os escolhidos são chips dentro dele, ao lado da busca', async () => {
    const onEnviar = vi.fn();
    montar({ iniciais: [ana], onEnviar });
    const campo = screen.getByRole('combobox', { name: 'Clientes de fora' });
    expect(screen.getByRole('button', { name: 'Remover Clínica Ana' })).toBeInTheDocument();

    await userEvent.type(campo, 'bet');
    await userEvent.click(await screen.findByRole('option', { name: 'Hospital Beta' }));
    expect(screen.getByRole('button', { name: 'Remover Hospital Beta' })).toBeInTheDocument();
    // A busca volta vazia para o próximo.
    expect(campo).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: 'Remover Clínica Ana' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onEnviar).toHaveBeenCalledWith(['c-beta']);
  });

  it('Esc no campo não apaga os escolhidos', async () => {
    const onEnviar = vi.fn();
    montar({ iniciais: [ana, beta], onEnviar });
    await userEvent.click(screen.getByRole('combobox', { name: 'Clientes de fora' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onEnviar).toHaveBeenCalledWith(['c-ana', 'c-beta']);
  });

  it('escolher de novo um já escolhido não repete', async () => {
    const onEnviar = vi.fn();
    montar({ iniciais: [ana], onEnviar });
    await userEvent.type(screen.getByRole('combobox', { name: 'Clientes de fora' }), 'a');
    const opcao = await screen.findByRole('option', { name: 'Clínica Ana' });
    expect(opcao).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onEnviar).toHaveBeenCalledWith(['c-ana']);
  });

  it('obrigatório: asterisco e erro abaixo do campo', async () => {
    const onEnviar = vi.fn();
    montar({ iniciais: [], onEnviar, exigir: true });
    expect(screen.getByText('*')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Escolha ao menos um cliente.')).toBeInTheDocument();
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('diz quando a busca não acha nada', async () => {
    montar({ iniciais: [], onEnviar: vi.fn(), buscar: async () => [] });
    await userEvent.type(screen.getByRole('combobox', { name: 'Clientes de fora' }), 'zzz');
    expect(await screen.findByText('Nada encontrado para “zzz”.')).toBeInTheDocument();
  });
});
