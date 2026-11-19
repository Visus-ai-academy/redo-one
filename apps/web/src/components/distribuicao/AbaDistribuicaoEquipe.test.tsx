import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { distribuicaoEquipeControllerObter } from '../../gen/clients/distribuicaoEquipeControllerObter';
import { distribuicaoEquipeControllerSalvarArranjos } from '../../gen/clients/distribuicaoEquipeControllerSalvarArranjos';
import { distribuicaoEquipeControllerSalvarUso } from '../../gen/clients/distribuicaoEquipeControllerSalvarUso';
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
vi.mock('../../gen/clients/distribuicaoEquipeControllerSalvarUso', () => ({
  distribuicaoEquipeControllerSalvarUso: vi.fn(),
}));
vi.mock('../../gen/clients/opcoesControllerListas', () => ({
  opcoesControllerListas: vi.fn(),
}));

const salvar = vi.mocked(distribuicaoEquipeControllerSalvarArranjos);
const salvarUso = vi.mocked(distribuicaoEquipeControllerSalvarUso);
const obter = vi.mocked(distribuicaoEquipeControllerObter);
const comPlantao = (plantao: boolean) =>
  obter.mockReturnValue({
    unwrap: async () => ({
      arranjos: [],
      clientes: [],
      exames: [],
      prioridades: [{ id: 'p-pla', nome: 'PLANTÃO', cor: null }],
      plantao,
    }),
  } as never);

beforeEach(() => {
  vi.mocked(opcoesControllerListas).mockReturnValue({
    unwrap: async () => ({
      modalidades: [],
      especialidades: [{ id: 'e-neuro', nome: 'NEURO', cor: null }],
      subespecialidades: [],
      categoriasExame: [],
      prioridades: [],
      contratados: [],
    }),
  } as never);
  comPlantao(false);
  salvar.mockReset();
  salvar.mockReturnValue({ unwrap: async () => undefined } as never);
  salvarUso.mockReset();
  salvarUso.mockReturnValue({ unwrap: async () => undefined } as never);
});

describe('AbaDistribuicaoEquipe', () => {
  it('mostra o uso pelo robô marcado e explica a opção', async () => {
    comPlantao(true);
    renderComRotas(<AbaDistribuicaoEquipe equipeId="eq-1" podeEditar />);
    const grupo = await screen.findByRole('group', { name: 'Uso pelo robô' });
    expect(grupo).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Só tirar do robô (plantão)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText(/fica para o plantão laudar à mão/)).toBeInTheDocument();
  });

  it('troca para direcionar aos membros e confirma', async () => {
    comPlantao(true);
    renderComRotas(<AbaDistribuicaoEquipe equipeId="eq-1" podeEditar />);
    const direcionar = await screen.findByRole('button', { name: 'Direcionar aos membros' });
    comPlantao(false);
    await userEvent.click(direcionar);
    expect(salvarUso).toHaveBeenCalledWith({
      path: { equipeId: 'eq-1' },
      body: { plantao: false },
    });
    expect(await acharAviso()).toHaveTextContent('A equipe passa a direcionar aos membros.');
    expect(await screen.findByText(/vai só para os membros/)).toBeInTheDocument();
  });

  it('sem editar, só mostra o uso', async () => {
    comPlantao(true);
    renderComRotas(<AbaDistribuicaoEquipe equipeId="eq-1" podeEditar={false} />);
    expect(await screen.findByRole('textbox', { name: 'Uso pelo robô' })).toHaveValue(
      'Só tirar do robô (plantão)',
    );
    expect(
      screen.queryByRole('button', { name: 'Direcionar aos membros' }),
    ).not.toBeInTheDocument();
  });

  it('cria um arranjo da equipe, sem clínica exclusiva', async () => {
    renderComRotas(<AbaDistribuicaoEquipe equipeId="eq-1" podeEditar />);
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
  });
});
