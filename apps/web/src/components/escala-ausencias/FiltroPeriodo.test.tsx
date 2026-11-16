import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FiltroPeriodo } from './FiltroPeriodo';

const HOJE = '2026-11-16';

describe('FiltroPeriodo', () => {
  it('sem período, mostra o padrão da lista', () => {
    render(<FiltroPeriodo hoje={HOJE} onMudar={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveTextContent(
      'Desde 30 dias atrás',
    );
  });

  it('o atalho preenche de hoje até hoje + N dias', async () => {
    const onMudar = vi.fn();
    render(<FiltroPeriodo hoje={HOJE} onMudar={onMudar} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Período' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Próximos 7 dias' }));

    expect(onMudar).toHaveBeenCalledWith({ de: HOJE, ate: '2026-11-23' });
  });

  it('reconhece o atalho escolhido e aceita datas soltas', () => {
    const onMudar = vi.fn();
    render(<FiltroPeriodo hoje={HOJE} de={HOJE} ate={HOJE} onMudar={onMudar} />);

    expect(screen.getByRole('combobox', { name: 'Período' })).toHaveTextContent('Hoje');
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-12-31' } });

    expect(onMudar).toHaveBeenCalledWith({ de: HOJE, ate: '2026-12-31' });
  });

  it('início depois do fim tira o fim', () => {
    const onMudar = vi.fn();
    render(<FiltroPeriodo hoje={HOJE} de={HOJE} ate="2026-11-20" onMudar={onMudar} />);

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-11-25' } });

    expect(onMudar).toHaveBeenCalledWith({ de: '2026-11-25', ate: undefined });
  });
});
