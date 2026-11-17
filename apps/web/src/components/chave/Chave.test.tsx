import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Chave } from './Chave';

describe('Chave', () => {
  it('liga e desliga pelo rótulo, com a descrição ligada ao controle', async () => {
    const onMudar = vi.fn();
    render(
      <Chave
        rotulo="Habilitado no robô"
        descricao="O robô entrega exames a ele."
        ligado={false}
        onMudar={onMudar}
      />,
    );
    const chave = screen.getByRole('switch', { name: 'Habilitado no robô' });
    expect(chave).not.toBeChecked();
    expect(chave).toHaveAccessibleDescription('O robô entrega exames a ele.');
    await userEvent.click(screen.getByText('Habilitado no robô'));
    expect(onMudar).toHaveBeenCalledWith(true);
  });

  it('em só leitura, mostra o estado sem deixar mudar', async () => {
    const onMudar = vi.fn();
    render(<Chave rotulo="Habilitado no robô" ligado somenteLeitura onMudar={onMudar} />);
    const chave = screen.getByRole('switch', { name: 'Habilitado no robô' });
    expect(chave).toBeChecked();
    await userEvent.click(chave);
    expect(onMudar).not.toHaveBeenCalled();
  });
});
