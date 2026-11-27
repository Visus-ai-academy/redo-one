import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderComRotas } from '../../test/render';
import { PainelTipoAviso } from './PainelTipoAviso';

const papeis = [
  { id: 'p-fat', nome: 'Financeiro' },
  { id: 'p-op', nome: 'Operação' },
];
const tipo = {
  tipo: 'preco_repetido' as const,
  impedeFecharCompetencia: true,
  responsaveis: [{ id: 'p-fat', nome: 'Financeiro' }],
  pendentes: 214,
};

describe('PainelTipoAviso', () => {
  it('escolhe os responsáveis e a trava, e salva', async () => {
    const onSalvar = vi.fn(async () => undefined);
    renderComRotas(
      <PainelTipoAviso
        tipo={tipo}
        papeis={papeis}
        podeEditar
        onSalvar={onSalvar}
        onFechar={() => undefined}
      />,
    );

    expect(await screen.findByText('214 avisos pendentes')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Financeiro' })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Operação' }));
    await userEvent.click(screen.getByRole('switch', { name: 'Impede fechar a competência' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSalvar).toHaveBeenCalledWith({
      papeisIds: ['p-fat', 'p-op'],
      impedeFecharCompetencia: false,
    });
  });

  it('sem permissão de editar, só mostra', async () => {
    renderComRotas(
      <PainelTipoAviso
        tipo={tipo}
        papeis={papeis}
        podeEditar={false}
        onSalvar={vi.fn()}
        onFechar={() => undefined}
      />,
    );
    expect(await screen.findByText('Financeiro')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });
});
