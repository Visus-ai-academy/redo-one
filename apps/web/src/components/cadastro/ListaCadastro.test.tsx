import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createDataTableColumnHelper } from '../data-table/columns';
import { BotaoAbrir, ListaCadastro } from './ListaCadastro';

type Item = { id: string; nome: string };
const coluna = createDataTableColumnHelper<Item>();
const onAbrir = vi.fn();
const colunas = [
  coluna.accessor('nome', {
    header: 'Nome',
    cell: (info) => (
      <BotaoAbrir onAbrir={() => onAbrir(info.row.original.id)}>{info.getValue()}</BotaoAbrir>
    ),
  }),
];

const props = {
  titulo: 'Contratados',
  colunas,
  getRowId: (i: Item) => i.id,
  busca: { valor: undefined, rotulo: 'Buscar contratados', placeholder: 'Razão social ou CNPJ' },
  pagina: 1,
  porPagina: 25,
  vazio: { titulo: 'Nenhum contratado ainda.', texto: 'Cadastre a empresa que emite a nota.' },
  onFiltrar: vi.fn(),
  onLimparFiltros: vi.fn(),
  onIrPara: vi.fn(),
};

describe('ListaCadastro', () => {
  it('mostra título com total, a ação de criar e as linhas que abrem o detalhe', async () => {
    const onNovo = vi.fn();
    render(
      <ListaCadastro
        {...props}
        itens={[{ id: 'c-1', nome: '001 TELEIMAGEM' }]}
        total={1}
        novo={{ rotulo: 'Novo contratado', onClick: onNovo }}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Contratados 1');
    await userEvent.click(screen.getByRole('button', { name: 'Novo contratado' }));
    expect(onNovo).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '001 TELEIMAGEM' }));
    expect(onAbrir).toHaveBeenCalledWith('c-1');
    expect(screen.getByText('1 de 1')).toBeInTheDocument();
  });

  it('sem nenhum item, diz o que fazer', () => {
    render(<ListaCadastro {...props} itens={[]} total={0} />);

    expect(screen.getByText('Nenhum contratado ainda.')).toBeInTheDocument();
    expect(screen.getByText('Cadastre a empresa que emite a nota.')).toBeInTheDocument();
  });

  it('sem resultado para a busca, oferece limpar os filtros', async () => {
    const onLimparFiltros = vi.fn();
    render(
      <ListaCadastro
        {...props}
        busca={{ ...props.busca, valor: 'xyz' }}
        itens={[]}
        total={0}
        onLimparFiltros={onLimparFiltros}
      />,
    );

    expect(screen.getByText('Nada encontrado para “xyz”.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(onLimparFiltros).toHaveBeenCalled();
  });

  it('manda a busca depois de uma pausa na digitação', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onFiltrar = vi.fn();
    render(<ListaCadastro {...props} itens={[]} total={0} onFiltrar={onFiltrar} />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar contratados' }), 'tele');
    expect(onFiltrar).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(350));

    expect(onFiltrar).toHaveBeenCalledWith({ busca: 'tele' });
    vi.useRealTimers();
  });
});
