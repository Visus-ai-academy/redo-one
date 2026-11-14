import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
});
