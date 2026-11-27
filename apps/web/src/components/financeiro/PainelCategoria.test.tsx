import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CategoriaItemDto } from '../../gen/types/CategoriaItemDto';
import { escolherOpcao } from '../../test/select';
import { PainelCategoria } from './PainelCategoria';

const categoria = (parcial: Partial<CategoriaItemDto>): CategoriaItemDto => ({
  id: 'x',
  tipo: 'despesa',
  nome: 'X',
  paiId: null,
  grupoNome: null,
  codigoContabil: null,
  ativa: true,
  totalFilhas: 0,
  ...parcial,
});

const grupos = [
  categoria({ id: 'g-ocupacao', nome: 'Ocupação', totalFilhas: 2 }),
  categoria({ id: 'g-pessoal', nome: 'Pessoal' }),
  categoria({ id: 'g-aluguel', nome: 'Aluguel', paiId: 'g-ocupacao', grupoNome: 'Ocupação' }),
  categoria({ id: 'g-laudos', tipo: 'receita', nome: 'Receita de laudos' }),
];

describe('PainelCategoria', () => {
  it('cria no tipo da aba, com o grupo escolhido e o código aparado', async () => {
    const onSalvar = vi.fn(async () => undefined);
    render(
      <PainelCategoria
        tipo="despesa"
        grupos={grupos}
        podeEditar
        onSalvar={onSalvar}
        onFechar={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByRole('textbox', { name: 'Nome' }), 'Condomínio');
    await escolherOpcao('Grupo', 'Ocupação');
    await userEvent.type(screen.getByRole('textbox', { name: 'Código contábil' }), ' 3.1.02 ');
    await userEvent.click(screen.getByRole('button', { name: 'Criar categoria' }));

    await waitFor(() =>
      expect(onSalvar).toHaveBeenCalledWith({
        tipo: 'despesa',
        nome: 'Condomínio',
        paiId: 'g-ocupacao',
        codigoContabil: '3.1.02',
        ativa: true,
      }),
    );
  });

  it('o grupo só oferece os do nível de cima do mesmo tipo', async () => {
    render(
      <PainelCategoria
        tipo="despesa"
        grupos={grupos}
        podeEditar
        onSalvar={vi.fn()}
        onFechar={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Grupo' }));
    const opcoes = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(opcoes).toEqual(['Nenhum (nível de cima)', 'Ocupação', 'Pessoal']);
  });

  it('exige o nome', async () => {
    const onSalvar = vi.fn();
    render(
      <PainelCategoria
        tipo="receita"
        grupos={grupos}
        podeEditar
        onSalvar={onSalvar}
        onFechar={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Criar categoria' }));
    expect(await screen.findByText('Informe o nome da categoria.')).toBeInTheDocument();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('grupo com categorias dentro não escolhe grupo nem tipo, e diz por quê', () => {
    render(
      <PainelCategoria
        tipo="despesa"
        categoria={grupos[0]}
        grupos={grupos}
        podeEditar
        onSalvar={vi.fn()}
        onFechar={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Grupo' })).toBeDisabled();
    expect(
      screen.getByText(
        'Tem 2 categorias dentro: é um grupo, fica no nível de cima e não muda de tipo.',
      ),
    ).toBeInTheDocument();
  });

  it('sem poder editar, mostra os dados só para leitura', () => {
    render(
      <PainelCategoria
        tipo="despesa"
        categoria={grupos[2]}
        grupos={grupos}
        podeEditar={false}
        onSalvar={vi.fn()}
        onFechar={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Grupo' })).toHaveValue('Ocupação');
  });
});
