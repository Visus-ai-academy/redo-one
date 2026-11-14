import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OpcaoBusca } from '../busca/BuscaSelecao';
import { useAppForm } from './form';

const ana = { valor: 'm-ana', rotulo: 'Ana Reis' };
const bruno = { valor: 'm-bruno', rotulo: 'Bruno Alves' };

function Formulario({
  iniciais,
  onEnviar,
  somenteLeitura = false,
}: {
  iniciais: OpcaoBusca[];
  onEnviar: (ids: string[]) => void;
  somenteLeitura?: boolean;
}) {
  const form = useAppForm({
    defaultValues: { membros: iniciais },
    onSubmit: ({ value }) => onEnviar(value.membros.map((m) => m.valor)),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="membros">
        {(field) => (
          <field.EscolhaMultiplaField
            label="Membros"
            rotuloAdicionar="Adicionar médico"
            placeholder="Digite o nome do médico"
            chave="medicos"
            buscar={async () => [ana, bruno]}
            vazio="Nenhum médico na equipe."
            somenteLeitura={somenteLeitura}
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

describe('EscolhaMultiplaField', () => {
  it('adiciona pela busca sem repetir e remove da lista', async () => {
    const onEnviar = vi.fn();
    montar({ iniciais: [ana], onEnviar });

    const membros = screen.getByRole('list', { name: 'Membros' });
    expect(within(membros).getByText('Ana Reis')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('combobox', { name: 'Adicionar médico' }), 'a');
    await userEvent.click(await screen.findByRole('option', { name: 'Bruno Alves' }));
    await userEvent.type(screen.getByRole('combobox', { name: 'Adicionar médico' }), 'a');
    await userEvent.click(await screen.findByRole('option', { name: 'Ana Reis' }));
    expect(within(membros).getAllByRole('listitem')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Remover Ana Reis' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onEnviar).toHaveBeenCalledWith(['m-bruno']);
  });

  it('sem ninguém, diz que está vazia', () => {
    montar({ iniciais: [], onEnviar: vi.fn() });

    expect(screen.getByText('Nenhum médico na equipe.')).toBeInTheDocument();
  });

  it('pagina de 5 em 5 (painel lateral)', () => {
    const muitos = Array.from({ length: 7 }, (_, i) => ({
      valor: `m-${i}`,
      rotulo: `Médico ${i}`,
    }));
    montar({ iniciais: muitos, onEnviar: vi.fn() });

    expect(
      within(screen.getByRole('list', { name: 'Membros' })).getAllByRole('listitem'),
    ).toHaveLength(5);
    expect(screen.getByText('1–5 de 7')).toBeInTheDocument();
  });

  it('só leitura: sem busca nem remover', () => {
    montar({ iniciais: [ana], onEnviar: vi.fn(), somenteLeitura: true });

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover Ana Reis' })).not.toBeInTheDocument();
  });
});
