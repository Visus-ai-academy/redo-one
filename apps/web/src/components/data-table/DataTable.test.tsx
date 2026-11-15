import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDataTableColumnHelper } from './columns';
import { DataTable } from './DataTable';

type User = { name: string; email: string };

const helper = createDataTableColumnHelper<User>();
const columns = helper.columns([
  helper.accessor('name', { header: 'Nome' }),
  helper.accessor('email', { header: 'E-mail' }),
]);

describe('DataTable', () => {
  it('renderiza cabeçalhos e uma linha por registro', () => {
    const data: User[] = [
      { name: 'Ada', email: 'ada@example.com' },
      { name: 'Alan', email: 'alan@example.com' },
    ];
    render(<DataTable caption="Usuários" columns={columns} data={data} />);

    const table = screen.getByRole('table', { name: 'Usuários' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Nome', 'E-mail']);
    expect(within(table).getByRole('cell', { name: 'alan@example.com' })).toBeInTheDocument();
  });

  it('mostra a mensagem de vazio quando não há registros', () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="Nenhum usuário" />);

    expect(screen.getByRole('cell', { name: 'Nenhum usuário' })).toBeInTheDocument();
  });

  it('marca a linha selecionada pelo id do registro', () => {
    const data: User[] = [
      { name: 'Ada', email: 'ada@example.com' },
      { name: 'Alan', email: 'alan@example.com' },
    ];
    render(
      <DataTable
        columns={columns}
        data={data}
        getRowId={(u) => u.email}
        selectedRowId="alan@example.com"
      />,
    );

    const [, ada, alan] = screen.getAllByRole('row');
    expect(alan).toHaveAttribute('aria-selected', 'true');
    expect(ada).not.toHaveAttribute('aria-selected');
  });

  it('com onRowClick, clicar em qualquer ponto da linha abre o registro, com cursor de clique', async () => {
    const abrir = vi.fn();
    const comBotao = helper.columns([
      helper.accessor('name', {
        header: 'Nome',
        cell: (i) => (
          <button type="button" onClick={() => abrir(`botão:${i.getValue()}`)}>
            {i.getValue()}
          </button>
        ),
      }),
      helper.accessor('email', { header: 'E-mail' }),
    ]);
    render(
      <DataTable
        columns={comBotao}
        data={[{ name: 'Ada', email: 'ada@example.com' }]}
        getRowId={(u) => u.email}
        onRowClick={(u) => abrir(`linha:${u.name}`)}
      />,
    );

    const linha = screen.getByRole('row', { name: /Ada/ });
    expect(linha).toHaveClass('cursor-pointer');
    await userEvent.click(screen.getByRole('cell', { name: 'ada@example.com' }));
    expect(abrir).toHaveBeenLastCalledWith('linha:Ada');

    // O botão dentro da linha faz só o dele: não dispara a linha de novo.
    abrir.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Ada' }));
    expect(abrir.mock.calls).toEqual([['botão:Ada']]);
  });

  it('sem onRowClick, a linha não parece clicável', () => {
    render(<DataTable columns={columns} data={[{ name: 'Ada', email: 'ada@example.com' }]} />);

    expect(screen.getByRole('row', { name: /Ada/ })).not.toHaveClass('cursor-pointer');
  });

  describe('colunas que saem quando não cabem', () => {
    type Pessoa = { name: string; email: string; papel: string };
    const h = createDataTableColumnHelper<Pessoa>();
    const tres = h.columns([
      h.accessor('name', { header: 'Nome' }),
      h.accessor('email', { header: 'E-mail' }),
      h.accessor('papel', { header: 'Papel' }),
    ]);
    const dados = [{ name: 'Ada', email: 'ada@example.com', papel: 'Financeiro' }];
    const cabecalhos = () => screen.getAllByRole('columnheader').map((th) => th.textContent);

    afterEach(() => vi.restoreAllMocks());

    it('com espaço, mostra todas', () => {
      render(<DataTable columns={tres} data={dados} ocultaveis={['papel', 'email']} />);

      expect(cabecalhos()).toEqual(['Nome', 'E-mail', 'Papel']);
    });

    it('sem espaço, tira na ordem só as que precisam sair', () => {
      // Cada coluna "ocupa" 100px; a caixa tem 250px: cabem duas.
      vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.querySelectorAll('th:not([hidden])').length * 100;
      });
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(250);

      render(<DataTable columns={tres} data={dados} ocultaveis={['papel', 'email']} />);

      expect(cabecalhos()).toEqual(['Nome', 'E-mail']);
    });
  });
});
