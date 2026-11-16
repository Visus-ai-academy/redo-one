import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EscolhaSegmentada } from './EscolhaSegmentada';
import { FiltroMultiplo } from './FiltroMultiplo';

describe('EscolhaSegmentada', () => {
  const opcoes = [
    { valor: 'semana', rotulo: 'Semana' },
    { valor: 'mes', rotulo: 'Mês' },
  ];

  it('marca a atual e avisa a troca', async () => {
    const onMudar = vi.fn();
    render(
      <EscolhaSegmentada aria-label="Modo" opcoes={opcoes} valor="semana" onMudar={onMudar} />,
    );
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Mês' }));
    expect(onMudar).toHaveBeenCalledWith('mes');
  });

  it('clicar na atual não deixa nada desmarcado', async () => {
    const onMudar = vi.fn();
    render(
      <EscolhaSegmentada aria-label="Modo" opcoes={opcoes} valor="semana" onMudar={onMudar} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Semana' }));
    expect(onMudar).not.toHaveBeenCalled();
  });
});

describe('FiltroMultiplo', () => {
  const opcoes = [
    { valor: 'a', rotulo: 'TC Neuro' },
    { valor: 'b', rotulo: 'RM Geral' },
  ];

  it('mostra "Todas" sem nada marcado e o resumo com marcados', () => {
    const { rerender } = render(
      <FiltroMultiplo
        rotulo="Frentes"
        todos="Todas"
        opcoes={opcoes}
        valor={[]}
        onMudar={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Frentes' })).toHaveTextContent('Todas');
    rerender(
      <FiltroMultiplo
        rotulo="Frentes"
        todos="Todas"
        opcoes={opcoes}
        valor={['a', 'b']}
        onMudar={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Frentes' })).toHaveTextContent('TC Neuro +1');
  });

  it('marca opções', async () => {
    const onMudar = vi.fn();
    render(
      <FiltroMultiplo
        rotulo="Frentes"
        todos="Todas"
        opcoes={opcoes}
        valor={[]}
        onMudar={onMudar}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Frentes' }));
    await userEvent.click(await screen.findByRole('option', { name: 'RM Geral' }));
    expect(onMudar).toHaveBeenCalledWith(['b']);
  });
});
