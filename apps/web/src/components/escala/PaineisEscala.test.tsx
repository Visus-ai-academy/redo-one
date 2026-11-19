import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { classificacoesEscalaControllerListar } from '../../gen/clients/classificacoesEscalaControllerListar';
import type { FrenteItemDto } from '../../gen/types/FrenteItemDto';
import { renderComRotas } from '../../test/render';
import { PaineisEscala } from './PaineisEscala';
import { turno } from './teste-dados';

vi.mock('../../gen/clients/classificacoesEscalaControllerListar', () => ({
  classificacoesEscalaControllerListar: vi.fn(),
}));

const listar = vi.mocked(classificacoesEscalaControllerListar);

const FRENTE: FrenteItemDto = {
  id: 'f-tc',
  tipo: 'especialidade',
  especialidadeId: 'f-tc',
  modalidadeId: null,
  destinoNome: 'TC Neuro',
  rotulo: 'TC Neuro',
  descricao: null,
  cor: null,
  ordem: 1,
  ativo: true,
};

beforeEach(() => {
  listar.mockReset();
  listar.mockReturnValue({
    unwrap: async () => ({
      prioridades: [
        { id: 'p-urg', nome: 'URGÊNCIA', cor: '#B5535A' },
        { id: 'p-int', nome: 'INTERNADO', cor: null },
      ],
      subespecialidades: [{ id: 's-cab', nome: 'Cabeça', ativo: true, especialidadeIds: ['f-tc'] }],
    }),
  } as never);
});

describe('PaineisEscala', () => {
  it('ao alocar, oferece as prioridades da operação e as subespecialidades da escala, sem depender de catalogo.ver', async () => {
    renderComRotas(
      <PaineisEscala
        painel={{ tipo: 'alocar', inicial: { frenteId: 'f-tc' } }}
        hoje="2026-11-17"
        turnos={[turno()]}
        frentes={[FRENTE]}
        conflitos={[]}
        permissoes={{ criar: true, editar: true, excluir: true }}
        podeDefinirAusencia={false}
        onAbrir={vi.fn()}
        onAvisos={vi.fn()}
      />,
    );

    expect(await screen.findByRole('checkbox', { name: 'URGÊNCIA' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'INTERNADO' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Cabeça' })).toBeInTheDocument();
    expect(screen.queryByText(/não vê o catálogo/)).not.toBeInTheDocument();
    expect(listar).toHaveBeenCalledTimes(1);
  });
});
