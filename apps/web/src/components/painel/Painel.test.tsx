import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Painel } from './Painel';

describe('Painel', () => {
  it('dá o espaço interno ao conteúdo, para nenhuma tela precisar lembrar dele', () => {
    render(
      <Painel titulo="Parâmetros">
        <p>Conteúdo</p>
      </Painel>,
    );

    expect(screen.getByText('Conteúdo').parentElement).toHaveClass('p-4');
  });

  it('com o conteúdo na borda (tabela ou lista com divisórias), não põe espaço', () => {
    render(
      <Painel titulo="Acessos" conteudoNaBorda>
        <p>Conteúdo</p>
      </Painel>,
    );

    expect(screen.getByText('Conteúdo').parentElement).not.toHaveClass('p-4');
  });
});
