import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { faixaDaPagina } from './faixa';
import { Paginacao } from './Paginacao';

describe('faixaDaPagina', () => {
  it.each([
    [1, 25, 47, '1–25 de 47'],
    [2, 25, 47, '26–47 de 47'],
    [1, 25, 0, '0 de 0'],
    [1, 25, 1, '1 de 1'],
    [3, 25, 2000, '51–75 de 2.000'],
  ])('página %i de %i por página, total %i → %s', (pagina, porPagina, total, esperado) => {
    expect(faixaDaPagina(pagina, porPagina, total)).toBe(esperado);
  });
});

describe('Paginacao', () => {
  it('mostra a faixa e vai para a página anterior e a próxima', async () => {
    const irPara = vi.fn();
    render(<Paginacao pagina={2} porPagina={25} total={60} onIrPara={irPara} />);

    expect(screen.getByText('26–50 de 60')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(irPara.mock.calls).toEqual([[1], [3]]);
  });

  it('desabilita os botões nas pontas', () => {
    render(<Paginacao pagina={1} porPagina={25} total={20} onIrPara={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();
  });
});
