import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PainelCarregando } from './PainelCarregando';

describe('PainelCarregando', () => {
  it('abre o painel na hora, avisando que está carregando', async () => {
    const onFechar = vi.fn();
    render(<PainelCarregando onFechar={onFechar} />);

    const painel = screen.getByRole('dialog', { name: 'Carregando…' });
    expect(painel).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));
    await waitFor(() => expect(onFechar).toHaveBeenCalled());
  });

  it('se falhar, diz o que houve e deixa tentar de novo', async () => {
    const tentar = vi.fn();
    render(<PainelCarregando onFechar={vi.fn()} erro onTentarDeNovo={tentar} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar');
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-busy', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(tentar).toHaveBeenCalled();
  });
});
