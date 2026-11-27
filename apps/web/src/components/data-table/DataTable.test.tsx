import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderComRotas } from '../../test/render';
import { createDataTableColumnHelper } from './columns';
import { DataTable } from './DataTable';
import { LinkDaLinha } from './link-da-linha';

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

  it('a caixa que rola segue o raio do painel no topo: o fundo do cabeçalho não vaza no canto', () => {
    render(<DataTable caption="Usuários" columns={columns} data={[]} />);

    const caixa = screen.getByRole('table', { name: 'Usuários' }).parentElement;
    // Raio interno do painel (8px menos a borda de 1px); a rolagem continua na própria caixa.
    expect(caixa).toHaveClass('rounded-t-[calc(var(--radius-lg)-1px)]', 'overflow-x-auto');
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
});

describe('DataTable: link na linha, ordenação e recarga', () => {
  const pessoas: User[] = [
    { name: 'Ada', email: 'ada@example.com' },
    { name: 'Alan', email: 'alan@example.com' },
  ];
  const comLink = helper.columns([
    helper.accessor('name', {
      header: 'Nome',
      cell: (c) => (
        <LinkDaLinha to="/" search={{ id: c.row.original.email }}>
          {c.getValue()}
        </LinkDaLinha>
      ),
    }),
    helper.accessor('email', { header: 'E-mail' }),
  ]);

  it('o nome é um link de verdade (com o ?id=), que abre em outra aba com Ctrl/⌘+clique', async () => {
    renderComRotas(<DataTable columns={comLink} data={pessoas} />);

    const link = await screen.findByRole('link', { name: 'Alan' });
    expect(link).toHaveAttribute('href', '/?id=alan%40example.com');
  });

  it('sem onRowClick, clicar em qualquer ponto da linha segue o link do nome', async () => {
    const { router } = renderComRotas(<DataTable columns={comLink} data={pessoas} />);

    await userEvent.click(await screen.findByRole('cell', { name: 'alan@example.com' }));

    expect(router.state.location.search).toEqual({ id: 'alan@example.com' });
    expect(screen.getByRole('cell', { name: 'alan@example.com' }).closest('tr')).toHaveClass(
      'has-[a[data-abre-linha]]:cursor-pointer',
    );
  });

  it('marca a coluna ordenada com aria-sort', () => {
    render(
      <DataTable columns={columns} data={pessoas} ordenacao={{ coluna: 'name', direcao: 'asc' }} />,
    );

    expect(screen.getByRole('columnheader', { name: 'Nome' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(screen.getByRole('columnheader', { name: 'E-mail' })).not.toHaveAttribute('aria-sort');
  });

  it('recarregando, mantém as linhas à vista, esmaecidas e com aria-busy', () => {
    render(<DataTable caption="Usuários" columns={columns} data={pessoas} recarregando />);

    const tabela = screen.getByRole('table', { name: 'Usuários' });
    expect(tabela.parentElement).toHaveAttribute('aria-busy', 'true');
    expect(within(tabela).getByRole('cell', { name: 'Ada' })).toBeInTheDocument();
    expect(tabela.querySelector('tbody')).toHaveClass('opacity-60');
  });

  it('com rodapé, a linha de total fica no tfoot, fixa embaixo quando a tabela rola', () => {
    render(
      <DataTable
        caption="Usuários"
        columns={columns}
        data={[{ name: 'Ada', email: 'ada@example.com' }]}
        rodape={['Total (1 usuário)', null]}
      />,
    );
    const tabela = screen.getByRole('table', { name: 'Usuários' });
    const rodape = tabela.querySelector('tfoot');
    expect(rodape).not.toBeNull();
    const celulas = within(rodape as HTMLElement).getAllByRole('cell');
    expect(celulas.map((c) => c.textContent)).toEqual(['Total (1 usuário)', '']);
    expect(rodape?.querySelector('tr')).toHaveClass('sticky', 'bottom-0');
  });

  it('linha em destaque ganha o fundo de atenção', () => {
    render(
      <DataTable
        caption="Usuários"
        columns={columns}
        data={[
          { name: 'Ada', email: 'ada@example.com' },
          { name: 'Alan', email: 'alan@example.com' },
        ]}
        linhaEmDestaque={(u) => u.name === 'Alan'}
      />,
    );
    const tabela = screen.getByRole('table', { name: 'Usuários' });
    expect(within(tabela).getByText('Alan').closest('tr')).toHaveClass('bg-warning-soft');
    expect(within(tabela).getByText('Ada').closest('tr')).not.toHaveClass('bg-warning-soft');
  });
});
