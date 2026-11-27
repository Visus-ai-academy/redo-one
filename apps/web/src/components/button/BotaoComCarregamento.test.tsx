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

  it('carregando, guarda a largura do rótulo e põe o giro por cima, sem empurrar nada', () => {
    render(
      <BotaoComCarregamento carregando rotuloCarregando="Salvando…">
        Salvar
      </BotaoComCarregamento>,
    );

    const botao = screen.getByRole('button', { name: 'Salvando…' });
    expect(botao).toHaveAttribute('aria-disabled', 'true');
    // O botão é a referência do que fica por cima.
    expect(botao).toHaveClass('relative');
    // O rótulo de sempre continua na tela, invisível: é ele que dá a largura do botão.
    const rotulo = screen.getByText('Salvar');
    expect(rotulo).toHaveClass('invisible');
    expect(rotulo).toHaveAttribute('aria-hidden', 'true');
    // O giro e o "Salvando…" ficam fora do fluxo, no espaço que o rótulo reservou; o texto que não
    // cabe ao lado do giro desce para uma segunda linha cortada (fica só o giro).
    const carregando = screen.getByText('Salvando…');
    expect(carregando).toHaveClass('whitespace-nowrap');
    const linha = carregando.parentElement;
    expect(linha).toHaveClass('flex-wrap', 'overflow-hidden', 'h-[1lh]');
    expect(linha?.parentElement).toHaveClass('absolute', 'inset-0');
  });

  it('sem rótulo de carregamento, o nome do botão continua o de sempre', () => {
    render(<BotaoComCarregamento carregando>Ler agora</BotaoComCarregamento>);

    expect(screen.getByRole('button', { name: 'Ler agora' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
