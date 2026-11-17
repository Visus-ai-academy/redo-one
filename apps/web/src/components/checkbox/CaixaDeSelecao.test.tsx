import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CaixaDeSelecao } from './CaixaDeSelecao';

describe('CaixaDeSelecao', () => {
  it('marca e desmarca pelo rótulo que a envolve', async () => {
    const onCheckedChange = vi.fn();
    render(
      // biome-ignore lint/a11y/noLabelWithoutControl: o Checkbox do Base UI renderiza o input dentro do label.
      <label>
        <CaixaDeSelecao checked={false} onCheckedChange={onCheckedChange} />
        Importar laudos
      </label>,
    );

    await userEvent.click(screen.getByText('Importar laudos'));

    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
    expect(screen.getByRole('checkbox', { name: 'Importar laudos' })).not.toBeChecked();
  });

  it('desabilitada não muda', async () => {
    const onCheckedChange = vi.fn();
    render(<CaixaDeSelecao checked onCheckedChange={onCheckedChange} disabled aria-label="Ver" />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Ver' }));

    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('em parte marcada, diz "misto" ao leitor de tela', () => {
    render(<CaixaDeSelecao checked={false} indeterminate aria-label="Ver em Cadastros" />);

    expect(screen.getByRole('checkbox', { name: 'Ver em Cadastros' })).toHaveAttribute(
      'aria-checked',
      'mixed',
    );
  });
});
