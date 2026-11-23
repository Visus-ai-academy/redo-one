import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PainelCobertura, type PainelCoberturaProps } from './PainelCobertura';

const titular = {
  medicoId: 'm1',
  medicoNome: 'Ana Souza',
  local: 'TC Neuro, Manhã',
  diasSemana: [1, 3],
  horarioInicio: '07:00',
  horarioFim: '13:00',
  produtividade: 40,
  dataInicio: '2026-11-02',
  dataFim: null,
};

function montar(props: Partial<PainelCoberturaProps> = {}) {
  const onSalvar = vi.fn(async () => undefined);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PainelCobertura
        titular={titular}
        dia="2026-11-18"
        buscarMedicos={async () => [
          { valor: 'm1', rotulo: 'Ana Souza' },
          { valor: 'm2', rotulo: 'Bruno Lima' },
        ]}
        onSalvar={onSalvar}
        onFechar={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onSalvar };
}

describe('PainelCobertura', () => {
  it('cria a cobertura com os dias, horário e produtividade do titular', async () => {
    const { onSalvar } = montar();
    expect(screen.getByRole('dialog', { name: 'Cobertura de Ana Souza' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Segunda' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Terça' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Produtividade/ })).toHaveValue('40');

    await userEvent.type(screen.getByRole('combobox', { name: 'Quem cobre' }), 'Bru');
    await userEvent.click(await screen.findByRole('option', { name: 'Bruno Lima' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar cobertura' }));

    expect(onSalvar).toHaveBeenCalledWith({
      medicoId: 'm2',
      dataInicio: '2026-11-18',
      dataFim: '2026-11-18',
      diasSemana: [1, 3],
      horarioInicio: '07:00',
      horarioFim: '13:00',
      produtividade: 40,
      observacoes: null,
    });
  });

  it('não deixa o titular cobrir a si mesmo', async () => {
    const { onSalvar } = montar();
    await userEvent.type(screen.getByRole('combobox', { name: 'Quem cobre' }), 'Ana');
    await userEvent.click(await screen.findByRole('option', { name: 'Ana Souza' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar cobertura' }));
    expect(
      await screen.findByText('Escolha outro médico: o titular não cobre a si mesmo.'),
    ).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('edita uma cobertura existente', async () => {
    const { onSalvar } = montar({
      atual: {
        medico: { valor: 'm2', rotulo: 'Bruno Lima' },
        dataInicio: '2026-11-16',
        dataFim: '2026-11-30',
        diasSemana: [1],
        horarioInicio: '07:00',
        horarioFim: '13:00',
        produtividade: null,
        observacoes: '',
      },
    });
    expect(screen.getByRole('checkbox', { name: 'Quarta' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSalvar).toHaveBeenCalledWith(
      expect.objectContaining({ medicoId: 'm2', dataFim: '2026-11-30', diasSemana: [1] }),
    );
  });

  it('fechar com o formulário alterado pergunta antes de descartar', async () => {
    const onFechar = vi.fn();
    montar({ onFechar });
    const campo = screen.getByRole('textbox', { name: /Produtividade/ });
    await userEvent.type(campo, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));
    expect(
      await screen.findByRole('alertdialog', { name: 'Descartar as alterações?' }),
    ).toBeInTheDocument();
    expect(onFechar).not.toHaveBeenCalled();
  });
});
