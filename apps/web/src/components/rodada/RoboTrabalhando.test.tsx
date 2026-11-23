import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RoboTrabalhando } from './RoboTrabalhando';

describe('RoboTrabalhando', () => {
  it('sem progresso conhecido, o anel gira (e para com movimento reduzido)', () => {
    render(<RoboTrabalhando rotulo="Lendo a fila" />);
    const barra = screen.getByRole('progressbar', { name: 'Lendo a fila' });
    expect(barra).not.toHaveAttribute('aria-valuenow');
    expect(barra).toHaveAttribute('aria-valuetext', 'Em andamento');
    const arco = barra.querySelector('[data-arco]');
    expect(arco?.getAttribute('class')).toMatch(/animate-\[spin/);
    expect(arco?.getAttribute('class')).toMatch(/motion-reduce:animate-none/);
  });

  it('com progresso, o anel enche na proporção e não gira', () => {
    render(<RoboTrabalhando rotulo="Atribuindo" progresso={0.25} />);
    const barra = screen.getByRole('progressbar', { name: 'Atribuindo' });
    expect(barra).toHaveAttribute('aria-valuenow', '25');
    const arco = barra.querySelector('[data-arco]');
    expect(arco?.getAttribute('class')).not.toMatch(/animate-\[spin/);
    // Circunferência 2π·17 ≈ 106,8; 25% cheio deixa 75% de deslocamento.
    expect(Number(arco?.getAttribute('stroke-dashoffset'))).toBeCloseTo(80.1, 0);
  });

  it('parado: nada se mexe', () => {
    render(<RoboTrabalhando rotulo="Pausada" progresso={0.5} parado />);
    const arco = screen.getByRole('progressbar').querySelector('[data-arco]');
    expect(arco?.getAttribute('class')).not.toMatch(/animate-/);
  });
});
