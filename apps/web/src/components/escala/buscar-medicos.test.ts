import { beforeEach, describe, expect, it, vi } from 'vitest';

import { medicosEscalaControllerListar } from '../../gen/clients/medicosEscalaControllerListar';
import { buscarMedicosAtivos, buscarMedicosDaEscala } from './buscar-medicos';

vi.mock('../../gen/clients/medicosEscalaControllerListar', () => ({
  medicosEscalaControllerListar: vi.fn(),
}));

const listar = vi.mocked(medicosEscalaControllerListar);

beforeEach(() => {
  listar.mockReset();
  listar.mockReturnValue({
    unwrap: async () => ({
      itens: [
        { id: 'm1', nome: 'Ana Souza', ativo: true },
        { id: 'm2', nome: 'Bruno Lima', ativo: false },
      ],
      total: 2,
      pagina: 1,
      porPagina: 20,
    }),
  } as never);
});

describe('busca de médicos da escala', () => {
  it('para alocar e cobrir, só ativos', async () => {
    await buscarMedicosAtivos('an');
    expect(listar).toHaveBeenCalledWith({ query: { busca: 'an', ativo: true, porPagina: 20 } });
  });

  it('no filtro, todos, com os inativos marcados', async () => {
    const opcoes = await buscarMedicosDaEscala('a');
    expect(listar).toHaveBeenCalledWith({ query: { busca: 'a', porPagina: 20 } });
    expect(opcoes).toEqual([
      { valor: 'm1', rotulo: 'Ana Souza', detalhe: null },
      { valor: 'm2', rotulo: 'Bruno Lima', detalhe: 'Inativo' },
    ]);
  });
});
