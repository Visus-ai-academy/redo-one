import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useArrastarParaOrdenar } from './use-arrastar-para-ordenar';

function Lista({ onMover }: { onMover: (de: number, para: number) => void }) {
  const { item, alca } = useArrastarParaOrdenar(onMover);
  return (
    <ul>
      {['a', 'b', 'c'].map((nome, i) => (
        <li key={nome} {...item(i)} data-testid={`item-${nome}`}>
          <span {...alca(i)} data-testid={`alca-${nome}`} />
          {nome}
        </li>
      ))}
    </ul>
  );
}

const dados = () => ({
  setData: vi.fn(),
  setDragImage: vi.fn(),
  effectAllowed: '',
  dropEffect: '',
});

describe('useArrastarParaOrdenar', () => {
  it('arrastar a alça de um item e soltar sobre outro move o item', () => {
    const onMover = vi.fn();
    render(<Lista onMover={onMover} />);
    const dataTransfer = dados();
    fireEvent.dragStart(screen.getByTestId('alca-a'), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId('item-c'), { dataTransfer });
    expect(screen.getByTestId('item-c')).toHaveAttribute('data-alvo');
    expect(screen.getByTestId('item-a')).toHaveAttribute('data-arrastando');
    fireEvent.drop(screen.getByTestId('item-c'), { dataTransfer });
    expect(onMover).toHaveBeenCalledWith(0, 2);
    expect(screen.getByTestId('item-c')).not.toHaveAttribute('data-alvo');
  });

  it('soltar no próprio lugar ou sem arrastar nada não move', () => {
    const onMover = vi.fn();
    render(<Lista onMover={onMover} />);
    fireEvent.drop(screen.getByTestId('item-b'), { dataTransfer: dados() });
    const dataTransfer = dados();
    fireEvent.dragStart(screen.getByTestId('alca-b'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('item-b'), { dataTransfer });
    expect(onMover).not.toHaveBeenCalled();
  });
});
