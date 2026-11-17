import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { QuebraDetalheDto } from '../../gen/types/QuebraDetalheDto';
import { escolherOpcao } from '../../test/select';
import { PainelQuebra, type PainelQuebraProps } from './PainelQuebra';

const quebra: QuebraDetalheDto = {
  id: 'q-1',
  estudoOrigem: 'TC TORAX E ABDOME X2',
  exame: null,
  pecas: [{ id: 'p-1', exame: { id: 'x-2', nome: 'TC ABDOME' }, categoria: null, ativo: true }],
};

function montar(props: Partial<PainelQuebraProps> = {}) {
  const handlers = {
    onSalvar: vi.fn(async () => undefined),
    onAdicionarPeca: vi.fn(async () => undefined),
    onAtualizarPeca: vi.fn(async () => undefined),
    onRemoverPeca: vi.fn(async () => undefined),
    onFechar: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PainelQuebra
        categorias={[{ id: 'c-angio', nome: 'ANGIO' }]}
        buscarExames={async () => [{ valor: 'x-3', rotulo: 'TC TORAX' }]}
        podeEditar
        podeCriar
        podeEditarPecas
        podeExcluir
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  );
  return handlers;
}

describe('PainelQuebra', () => {
  it('cria pelo nome do estudo como chega; as peças aparecem depois de criada', async () => {
    const { onSalvar } = montar();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Estudo como chega da MobileMed' }),
      ' TC TORAX E ABDOME ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Criar quebra' }));

    expect(onSalvar).toHaveBeenCalledWith({ estudoOrigem: 'TC TORAX E ABDOME' });
    expect(
      screen.queryByRole('region', { name: 'Exames em que se quebra' }),
    ).not.toBeInTheDocument();
  });

  it('diz quando o estudo também é um exame do cadastro', () => {
    montar({ quebra: { ...quebra, exame: { id: 'x-9', nome: 'TC TORAX E ABDOME X2' } } });

    expect(
      screen.getByText('Também é o exame TC TORAX E ABDOME X2 do cadastro.'),
    ).toBeInTheDocument();
  });

  it('editando, lista as peças, adiciona, desativa e remove', async () => {
    const { onAdicionarPeca, onAtualizarPeca, onRemoverPeca } = montar({ quebra });

    const pecas = screen.getByRole('region', { name: 'Exames em que se quebra' });
    expect(within(pecas).getByText('TC ABDOME')).toBeInTheDocument();

    await userEvent.type(within(pecas).getByRole('combobox', { name: 'Exame' }), 'tc');
    await userEvent.click(await screen.findByRole('option', { name: 'TC TORAX' }));
    await escolherOpcao('Categoria, se o exame não tiver', 'ANGIO');
    await userEvent.click(within(pecas).getByRole('button', { name: 'Adicionar exame' }));
    expect(onAdicionarPeca).toHaveBeenCalledWith({
      exameId: 'x-3',
      categoriaId: 'c-angio',
      ativo: true,
    });

    await userEvent.click(
      within(pecas).getByRole('checkbox', { name: 'TC ABDOME ativo na quebra' }),
    );
    expect(onAtualizarPeca).toHaveBeenCalledWith('p-1', {
      exameId: 'x-2',
      categoriaId: null,
      ativo: false,
    });

    await userEvent.click(
      within(pecas).getByRole('button', { name: 'Remover TC ABDOME da quebra' }),
    );
    expect(onRemoverPeca).toHaveBeenCalledWith('p-1');
  });

  it('sem permissão, só mostra', () => {
    montar({
      quebra,
      podeEditar: false,
      podeCriar: false,
      podeEditarPecas: false,
      podeExcluir: false,
    });

    expect(screen.queryByRole('button', { name: /Remover/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adicionar exame' })).not.toBeInTheDocument();
  });

  it('sem editar mas com excluir, o painel só leitura mostra Excluir e confirma', async () => {
    const onExcluir = vi.fn(async () => undefined);
    montar({
      quebra,
      podeEditar: false,
      podeCriar: false,
      podeEditarPecas: false,
      podeExcluir: false,
      onExcluir,
    });

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Excluir quebra' }));
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Excluir quebra' }).at(-1) as HTMLElement,
    );

    expect(onExcluir).toHaveBeenCalled();
  });
});
