import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { renderComRotas } from '../../test/render';
import { createDataTableColumnHelper } from '../data-table/columns';
import { BotaoAbrir, ListaCadastro } from './ListaCadastro';

type Item = { id: string; nome: string; cnpj?: string };
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

  it('o painel fica por cima: com ele aberto, a lista não muda nada (classes, colunas)', () => {
    const duas = [...colunas, coluna.accessor('cnpj', { header: 'CNPJ' })];
    const item = [{ id: 'c-1', nome: 'A', cnpj: '1' }];
    const { container, rerender } = render(
      <ListaCadastro {...props} colunas={duas} itens={item} total={1} />,
    );
    const classes = () =>
      [container.firstElementChild, screen.getByRole('region', { name: 'Contratados' })].map(
        (el) => el?.className,
      );
    const sem = classes();

    rerender(<ListaCadastro {...props} colunas={duas} itens={item} total={1} painel={<aside />} />);

    expect(classes()).toEqual(sem);
    expect(sem.join(' ')).not.toMatch(/painel-lateral|hidden/);
    for (const nome of ['Nome', 'CNPJ']) {
      expect(screen.getByRole('columnheader', { name: nome })).toBeVisible();
    }
  });

  it('sem busca (lista por data), não mostra campo de busca nem a faixa vazia', () => {
    const { busca: _, ...semBusca } = props;
    render(<ListaCadastro {...semBusca} itens={[{ id: 'c-1', nome: 'laudos.xlsx' }]} total={1} />);

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'laudos.xlsx' })).toBeInTheDocument();
  });

  it('total grande no título com separador de milhar', () => {
    render(<ListaCadastro {...props} itens={[{ id: 'c-1', nome: 'A' }]} total={1234} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Contratados 1.234');
  });

  it('recarregando (filtro, página), mantém as linhas à vista e marca a tabela como ocupada', () => {
    render(<ListaCadastro {...props} itens={[{ id: 'c-1', nome: 'A' }]} total={1} recarregando />);

    expect(screen.getByRole('table').parentElement).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
  });

  it('se a lista falhar, mostra o estado do erro no lugar da tabela, com tentar de novo', async () => {
    const tentar = vi.fn();
    const erro = new ResponseError({
      data: {},
      status: 500,
      statusText: '',
      request: new Request('http://api.test/x'),
      response: new Response(),
    });
    renderComRotas(
      <ListaCadastro
        {...props}
        itens={[]}
        total={0}
        erro={{ erro, oQue: 'os contratados', onTentarDeNovo: tentar }}
      />,
    );

    expect(await screen.findByText('Não foi possível carregar os contratados')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum contratado ainda.')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(tentar).toHaveBeenCalled();
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

  it('não apaga o que se digitou enquanto a busca anterior chega na URL', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onFiltrar = vi.fn();
    const { rerender } = render(
      <ListaCadastro {...props} itens={[]} total={0} onFiltrar={onFiltrar} />,
    );
    const campo = screen.getByRole('searchbox', { name: 'Buscar contratados' });

    await userEvent.type(campo, 'rm');
    await act(() => vi.advanceTimersByTimeAsync(350));
    await userEvent.type(campo, ' ab');
    rerender(
      <ListaCadastro
        {...props}
        busca={{ ...props.busca, valor: 'rm' }}
        itens={[]}
        total={0}
        onFiltrar={onFiltrar}
      />,
    );

    expect(campo).toHaveValue('rm ab');
    vi.useRealTimers();
  });

  it('busca mudada por fora (limpar filtros, voltar) aparece no campo', () => {
    const { rerender } = render(
      <ListaCadastro {...props} busca={{ ...props.busca, valor: 'tele' }} itens={[]} total={0} />,
    );
    rerender(<ListaCadastro {...props} itens={[]} total={0} />);

    expect(screen.getByRole('searchbox', { name: 'Buscar contratados' })).toHaveValue('');
  });
});
