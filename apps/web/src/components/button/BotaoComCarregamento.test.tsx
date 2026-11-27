import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BotaoComCarregamento } from './BotaoComCarregamento';

describe('BotaoComCarregamento', () => {
  it('fora do carregamento mostra o rótulo e fica disponível', () => {
    render(<BotaoComCarregamento rotuloCarregando="Salvando…">Salvar</BotaoComCarregamento>);

    const botao = screen.getByRole('button', { name: 'Salvar' });
    expect(botao).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Salvar')).not.toHaveClass('invisible');
  });

  it('a largura cabe o giro com o texto de carregamento desde antes do envio', () => {
    render(<BotaoComCarregamento rotuloCarregando="Salvando…">Salvar</BotaoComCarregamento>);

    // Parado, o "Salvando…" já está no botão, invisível e fora do nome: é ele que dá a largura
    // mínima, então o botão não muda de tamanho quando o envio começa.
    const carregando = screen.getByText('Salvando…');
    const camada = carregando.closest('[data-camada="carregando"]');
    expect(camada).toHaveClass('invisible');
    expect(camada).toHaveAttribute('aria-hidden', 'true');
    expect(carregando).toHaveClass('whitespace-nowrap');
    // As duas camadas ocupam a mesma célula da grade: o botão fica com a largura da maior.
    const rotulo = screen.getByText('Salvar').closest('[data-camada="rotulo"]');
    expect(rotulo).toHaveClass('[grid-area:1/1]');
    expect(camada).toHaveClass('[grid-area:1/1]');
    expect(rotulo?.parentElement).toBe(camada?.parentElement);
    expect(rotulo?.parentElement).toHaveClass('grid');
  });

  it('carregando, mostra o giro e o texto inteiro no lugar do rótulo, sem cortar', () => {
    render(
      <BotaoComCarregamento carregando rotuloCarregando="Salvando…">
        Salvar
      </BotaoComCarregamento>,
    );

    const botao = screen.getByRole('button', { name: 'Salvando…' });
    expect(botao).toHaveAttribute('aria-disabled', 'true');
    const rotulo = screen.getByText('Salvar').closest('[data-camada="rotulo"]');
    expect(rotulo).toHaveClass('invisible');
    expect(rotulo).toHaveAttribute('aria-hidden', 'true');
    const camada = screen.getByText('Salvando…').closest('[data-camada="carregando"]');
    expect(camada).not.toHaveClass('invisible');
    expect(camada).not.toHaveAttribute('aria-hidden');
    expect(camada?.querySelector('svg')).toHaveClass('animate-spin');
    // Nada de linha cortada: o texto não some ao lado do giro.
    expect(camada).not.toHaveClass('overflow-hidden');
  });

  it('sem rótulo de carregamento, o nome do botão continua o de sempre', () => {
    render(<BotaoComCarregamento carregando>Ler agora</BotaoComCarregamento>);

    expect(screen.getByRole('button', { name: 'Ler agora' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
