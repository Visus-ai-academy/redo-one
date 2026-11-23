import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AbasComHistorico } from './AbasComHistorico';

describe('AbasComHistorico', () => {
  it('sem histórico nem outras abas, mostra só o cadastro, sem abas', () => {
    render(<AbasComHistorico aria-label="Partes">cadastro</AbasComHistorico>);
    expect(screen.getByText('cadastro')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('põe as outras abas entre Cadastro e Histórico e mostra a escolhida', async () => {
    render(
      <AbasComHistorico
        aria-label="Partes"
        historico="o histórico"
        extras={[{ valor: 'distribuicao', rotulo: 'Distribuição', conteudo: 'as regras' }]}
      >
        cadastro
      </AbasComHistorico>,
    );
    expect(screen.getAllByRole('tab').map((aba) => aba.textContent)).toEqual([
      'Cadastro',
      'Distribuição',
      'Histórico',
    ]);
    await userEvent.click(screen.getByRole('tab', { name: 'Distribuição' }));
    expect(screen.getByText('as regras')).toBeInTheDocument();
    expect(screen.getByText('cadastro')).not.toBeVisible();
  });

  it('com outra aba e sem histórico, mostra as abas sem o Histórico', () => {
    render(
      <AbasComHistorico
        aria-label="Partes"
        extras={[{ valor: 'distribuicao', rotulo: 'Distribuição', conteudo: 'as regras' }]}
      >
        cadastro
      </AbasComHistorico>,
    );
    expect(screen.getAllByRole('tab').map((aba) => aba.textContent)).toEqual([
      'Cadastro',
      'Distribuição',
    ]);
  });

  it('trocar de aba não perde o que se digitou no cadastro', async () => {
    render(
      <AbasComHistorico aria-label="Partes" historico="o histórico">
        <input aria-label="Nome" />
      </AbasComHistorico>,
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Nome' }), 'Ana');
    await userEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    expect(screen.queryByRole('textbox', { name: 'Nome' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Cadastro' }));

    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue('Ana');
  });
});
