import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Abas } from './Abas';

describe('Abas', () => {
  it('marca a aba atual, troca pelo clique e mostra só o conteúdo dela', async () => {
    const onMudar = vi.fn();
    render(
      <Abas
        aria-label="Listas do catálogo"
        valor="modalidades"
        onMudar={onMudar}
        abas={[
          { valor: 'modalidades', rotulo: 'Modalidades' },
          { valor: 'prioridades', rotulo: 'Prioridades' },
        ]}
      >
        <p>Conteúdo das modalidades</p>
      </Abas>,
    );

    expect(screen.getByRole('tablist', { name: 'Listas do catálogo' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Modalidades' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Conteúdo das modalidades');

    await userEvent.click(screen.getByRole('tab', { name: 'Prioridades' }));
    expect(onMudar).toHaveBeenCalledWith('prioridades');
  });

  it('sem conteúdo, serve só de navegação (o conteúdo fica logo abaixo, sem espaço a mais)', () => {
    render(
      <Abas aria-label="Listas" valor="a" onMudar={vi.fn()} abas={[{ valor: 'a', rotulo: 'A' }]} />,
    );

    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
  });

  it('com mais abas do que cabem: sem barra de rolagem, esmaece a borda que tem mais abas', () => {
    render(
      <Abas
        aria-label="Abas largas"
        valor="a"
        onMudar={vi.fn()}
        abas={[
          { valor: 'a', rotulo: 'A' },
          { valor: 'b', rotulo: 'B' },
        ]}
      />,
    );
    const lista = screen.getByRole('tablist', { name: 'Abas largas' });
    expect(lista.className).toContain('[scrollbar-width:none]');
    // jsdom não mede: simula a lista mais larga que o espaço, rolada até o começo.
    Object.defineProperty(lista, 'scrollWidth', { configurable: true, value: 500 });
    Object.defineProperty(lista, 'clientWidth', { configurable: true, value: 300 });
    fireEvent.scroll(lista);

    expect(lista).toHaveAttribute('data-mais-a-direita');
    expect(lista).not.toHaveAttribute('data-mais-a-esquerda');
  });

  it('leva a aba atual para a vista', () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar;
    render(
      <Abas
        aria-label="Abas"
        valor="b"
        onMudar={vi.fn()}
        abas={[
          { valor: 'a', rotulo: 'A' },
          { valor: 'b', rotulo: 'B' },
        ]}
      />,
    );

    expect(rolar).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  it('a roda vertical do mouse rola as abas para o lado quando elas não cabem', () => {
    render(
      <Abas
        aria-label="Abas"
        valor="a"
        onMudar={vi.fn()}
        abas={[
          { valor: 'a', rotulo: 'A' },
          { valor: 'b', rotulo: 'B' },
        ]}
      />,
    );
    const lista = screen.getByRole('tablist', { name: 'Abas' });
    Object.defineProperty(lista, 'scrollWidth', { configurable: true, value: 500 });
    Object.defineProperty(lista, 'clientWidth', { configurable: true, value: 300 });

    fireEvent.wheel(lista, { deltaY: 40, deltaX: 0 });

    expect(lista.scrollLeft).toBe(40);
  });
});
