import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { distribuicaoEquipeControllerObter } from '../../gen/clients/distribuicaoEquipeControllerObter';
import { distribuicaoEquipeControllerSalvarArranjos } from '../../gen/clients/distribuicaoEquipeControllerSalvarArranjos';
import { opcoesControllerListas } from '../../gen/clients/opcoesControllerListas';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { AbaDistribuicaoEquipe } from './AbaDistribuicaoEquipe';

vi.mock('../../gen/clients/distribuicaoEquipeControllerObter', () => ({
  distribuicaoEquipeControllerObter: vi.fn(),
}));
vi.mock('../../gen/clients/distribuicaoEquipeControllerSalvarArranjos', () => ({
  distribuicaoEquipeControllerSalvarArranjos: vi.fn(),
}));
vi.mock('../../gen/clients/opcoesControllerListas', () => ({
  opcoesControllerListas: vi.fn(),
}));

const salvar = vi.mocked(distribuicaoEquipeControllerSalvarArranjos);

beforeEach(() => {
  vi.mocked(opcoesControllerListas).mockReturnValue({
    unwrap: async () => ({
      modalidades: [],
      especialidades: [{ id: 'e-neuro', nome: 'NEURO', cor: null }],
      subespecialidades: [],
      categoriasExame: [],
      prioridades: [{ id: 'p-pla', nome: 'PLANTÃO', cor: null }],
      contratados: [],
    }),
  } as never);
  vi.mocked(distribuicaoEquipeControllerObter).mockReturnValue({
    unwrap: async () => ({ arranjos: [], clientes: [], exames: [] }),
  } as never);
  salvar.mockReset();
  salvar.mockReturnValue({ unwrap: async () => undefined } as never);
});

describe('AbaDistribuicaoEquipe', () => {
  it('diz que a equipe é de plantão', async () => {
    renderComRotas(<AbaDistribuicaoEquipe equipeId="eq-1" plantao podeEditar />);
    expect(await screen.findByText(/Equipe de plantão/)).toBeInTheDocument();
  });

  it('cria um arranjo da equipe, sem clínica exclusiva', async () => {
    renderComRotas(<AbaDistribuicaoEquipe equipeId="eq-1" plantao={false} podeEditar />);
    await userEvent.click(await screen.findByRole('button', { name: 'Novo arranjo' }));
    expect(screen.queryByText('Clínicas exclusivas')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'PLANTÃO' }));
    await userEvent.click(screen.getByRole('button', { name: 'Criar arranjo' }));
    expect(salvar).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { equipeId: 'eq-1' },
        body: { arranjos: [expect.objectContaining({ prioridadeIds: ['p-pla'] })] },
      }),
    );
    expect(await acharAviso()).toHaveTextContent('Arranjo criado.');
    expect(screen.queryByText(/Equipe de plantão/)).not.toBeInTheDocument();
  });
});
