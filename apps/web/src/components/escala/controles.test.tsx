import { render, screen, within } from '@testing-library/react';
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
    { valor: 'a', rotulo: 'TC Neuro', cor: '#4E8C88' },
    { valor: 'b', rotulo: 'RM Geral', cor: null },
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

  it('mostra a cor de cada opção numa bolinha (sem cor, só o contorno)', async () => {
    render(
      <FiltroMultiplo
        rotulo="Frentes"
        todos="Todas"
        opcoes={opcoes}
        valor={[]}
        onMudar={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Frentes' }));
    const comCor = await screen.findByRole('option', { name: 'TC Neuro' });
    expect(comCor.querySelector('[data-cor]')).toHaveStyle({ backgroundColor: '#4E8C88' });
    const semCor = screen.getByRole('option', { name: 'RM Geral' });
    expect(semCor.querySelector('[data-cor]')).not.toHaveAttribute('style');
  });

  it('agrupa as opções sob subtítulos quando têm grupo', async () => {
    render(
      <FiltroMultiplo
        rotulo="Frentes"
        todos="Todas"
        opcoes={[
          { valor: 'a', rotulo: 'NEURO', grupo: 'Especialidades', cor: null },
          { valor: 'b', rotulo: 'TC', grupo: 'Modalidades', cor: null },
          { valor: 'c', rotulo: 'Velha (inativa)', cor: null },
        ]}
        valor={[]}
        onMudar={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: 'Frentes' }));
    const esp = await screen.findByRole('group', { name: 'Especialidades' });
    expect(within(esp).getByRole('option', { name: 'NEURO' })).toBeInTheDocument();
    const mod = screen.getByRole('group', { name: 'Modalidades' });
    expect(within(mod).getByRole('option', { name: 'TC' })).toBeInTheDocument();
    expect(within(mod).queryByRole('option', { name: 'Velha (inativa)' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Velha (inativa)' })).toBeInTheDocument();
  });
});
