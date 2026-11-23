import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { BuscaSelecao, type OpcaoBusca } from './BuscaSelecao';

const EXAMES: OpcaoBusca[] = [
  { valor: 'e-1', rotulo: 'TC CRANIO', detalhe: 'CT' },
  { valor: 'e-2', rotulo: 'RM CRANIO', detalhe: 'MR' },
];

function Campo({ inicial = null }: { inicial?: OpcaoBusca | null }) {
  const [valor, setValor] = useState<OpcaoBusca | null>(inicial);
  const buscar = vi.fn(async (termo: string) =>
    EXAMES.filter((e) => e.rotulo.toLowerCase().includes(termo.toLowerCase())),
  );
  return (
    <QueryClientProvider client={new QueryClient()}>
      <label htmlFor="exame">Exame</label>
      <BuscaSelecao
        id="exame"
        chave="exames"
        buscar={buscar}
        valor={valor}
        onMudar={setValor}
        placeholder="Digite o nome"
      />
      <output>{valor?.valor ?? 'nenhum'}</output>
    </QueryClientProvider>
  );
}

describe('BuscaSelecao', () => {
  it('busca enquanto digita e escolhe um resultado', async () => {
    render(<Campo />);

    await userEvent.type(screen.getByRole('combobox', { name: 'Exame' }), 'tc');
    await userEvent.click(await screen.findByRole('option', { name: /TC CRANIO/ }));

    expect(screen.getByRole('status')).toHaveTextContent('e-1');
    expect(screen.getByRole('combobox', { name: 'Exame' })).toHaveValue('TC CRANIO');
  });

  it('diz quando nada foi encontrado', async () => {
    render(<Campo />);

    await userEvent.type(screen.getByRole('combobox', { name: 'Exame' }), 'xyz');

    expect(await screen.findByText('Nada encontrado para “xyz”.')).toBeInTheDocument();
  });

  it('limpa a escolha', async () => {
    render(<Campo inicial={EXAMES[0]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Limpar' }));

    expect(screen.getByRole('status')).toHaveTextContent('nenhum');
  });

  it('espera ~300ms depois da última tecla e cancela a busca anterior', async () => {
    const sinais: AbortSignal[] = [];
    const termos: string[] = [];
    const buscar = vi.fn(
      (termo: string, sinal?: AbortSignal) =>
        new Promise<OpcaoBusca[]>((resolve) => {
          termos.push(termo);
          if (sinal) sinais.push(sinal);
          setTimeout(
            () => resolve(EXAMES.filter((e) => e.rotulo.includes(termo.toUpperCase()))),
            400,
          );
        }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <label htmlFor="exame">Exame</label>
        <BuscaSelecao
          id="exame"
          chave="exames"
          buscar={buscar}
          valor={null}
          onMudar={vi.fn()}
          placeholder=""
        />
      </QueryClientProvider>,
    );
    const campo = screen.getByRole('combobox', { name: 'Exame' });

    await userEvent.type(campo, 'cr');
    await new Promise((r) => setTimeout(r, 260));
    expect(buscar).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(termos).toEqual(['cr']));

    await userEvent.type(campo, 'a');
    await vi.waitFor(() => expect(termos).toEqual(['cr', 'cra']));
    expect(sinais[0]?.aborted).toBe(true);
    expect(await screen.findByRole('option', { name: /RM CRANIO/ })).toBeInTheDocument();
  });
});
