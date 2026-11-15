import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PainelNaoEspecialidade, PainelSufixo } from './PaineisDePara';

const comConsultas = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const base = { podeEditar: true, onFechar: vi.fn() };

describe('painéis dos de-paras', () => {
  it('não é especialidade: só o valor que chega, sem destino', async () => {
    const onSalvar = vi.fn(async () => undefined);
    comConsultas(<PainelNaoEspecialidade {...base} onSalvar={onSalvar} />);

    expect(screen.queryByRole('combobox', { name: 'Especialidade' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Valor que chega' }), 'ONCOLÓGICO');
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }));

    expect(onSalvar).toHaveBeenCalledWith({
      tipo: 'invalida',
      origem: 'ONCOLÓGICO',
      especialidadeId: null,
      ativo: true,
      observacoes: null,
    });
  });

  it('sufixo: só o texto cortado', async () => {
    const onSalvar = vi.fn(async () => undefined);
    comConsultas(<PainelSufixo {...base} onSalvar={onSalvar} />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Sufixo' }), '_RMX');
    await userEvent.click(screen.getByRole('button', { name: 'Criar sufixo' }));

    expect(onSalvar).toHaveBeenCalledWith({ sufixo: '_RMX', ativo: true, observacoes: null });
  });

  it('sem permissão de editar, os campos ficam desabilitados', () => {
    comConsultas(
      <PainelNaoEspecialidade
        podeEditar={false}
        onFechar={vi.fn()}
        item={
          {
            id: 'd-1',
            tipo: 'invalida',
            origem: 'CT',
            especialidadeId: null,
            ativo: true,
            observacoes: null,
          } as never
        }
        onSalvar={vi.fn()}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Valor que chega' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Ativo' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
