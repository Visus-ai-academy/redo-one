import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ComEsqueleto } from './ComEsqueleto';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ComEsqueleto', () => {
  it('reserva o lugar com o skeleton invisível e só o mostra depois de 200ms', () => {
    render(
      <ComEsqueleto carregando esqueleto={<p>forma</p>}>
        {() => <p>dados</p>}
      </ComEsqueleto>,
    );

    const reserva = screen.getByText('forma').parentElement;
    expect(reserva).toHaveClass('invisible');
    expect(reserva).toHaveAttribute('aria-busy', 'true');
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByText('forma').parentElement).not.toHaveClass('invisible');
  });

  it('com os dados, mostra o conteúdo', () => {
    render(
      <ComEsqueleto carregando={false} esqueleto={<p>forma</p>}>
        {() => <p>dados</p>}
      </ComEsqueleto>,
    );

    expect(screen.getByText('dados')).toBeInTheDocument();
    expect(screen.queryByText('forma')).not.toBeInTheDocument();
  });
});
