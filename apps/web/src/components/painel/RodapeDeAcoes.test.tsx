import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RodapeDeAcoes } from './RodapeDeAcoes';

describe('RodapeDeAcoes', () => {
  it('põe a ação do início à esquerda e as do fim juntas, sem quebrar o grupo', () => {
    render(
      <RodapeDeAcoes inicio={<button type="button">Excluir</button>}>
        <button type="button">Cancelar</button>
        <button type="button">Salvar</button>
      </RodapeDeAcoes>,
    );

    const excluir = screen.getByRole('button', { name: 'Excluir' });
    const grupo = screen.getByRole('button', { name: 'Salvar' }).parentElement;
    const linha = excluir.parentElement;
    // Mede a largura do próprio rodapé (painel de 400px ou tela cheia), não a da janela.
    expect(linha?.parentElement).toHaveClass('@container');
    // No estreito, empilha de propósito; com espaço, uma linha só: início à esquerda, fim à direita.
    expect(linha).toHaveClass('flex-col', '@min-[22.5rem]:flex-row');
    expect(grupo).toHaveClass('flex-nowrap', '@min-[22.5rem]:ml-auto');
    expect(grupo).toContainElement(screen.getByRole('button', { name: 'Cancelar' }));
  });

  it('sem ação no início, desenha só o grupo do fim', () => {
    render(
      <RodapeDeAcoes>
        <button type="button">Salvar</button>
      </RodapeDeAcoes>,
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
