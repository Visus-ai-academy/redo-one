import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { CelulaComPopover } from './CelulaComPopover';

describe('CelulaComPopover', () => {
  it('mostra o valor curto e, ao clicar, abre o editor com o título', async () => {
    render(
      <CelulaComPopover rotulo="ROTINA na Lista: ≥ 24 h" titulo="ROTINA na Lista" valor="≥ 24 h">
        <p>Editor da célula</p>
      </CelulaComPopover>,
    );
    const celula = screen.getByRole('button', { name: 'ROTINA na Lista: ≥ 24 h' });
    expect(celula).toHaveTextContent('≥ 24 h');
    expect(screen.queryByText('Editor da célula')).not.toBeInTheDocument();
    await userEvent.click(celula);
    expect(await screen.findByRole('dialog', { name: 'ROTINA na Lista' })).toBeInTheDocument();
    expect(screen.getByText('Editor da célula')).toBeInTheDocument();
  });

  it('marca a célula inválida para o leitor de tela', () => {
    render(
      <CelulaComPopover rotulo="ROTINA na Lista" titulo="ROTINA na Lista" valor="≥ h" invalida>
        <p>Editor</p>
      </CelulaComPopover>,
    );
    expect(screen.getByRole('button', { name: 'ROTINA na Lista' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
});
