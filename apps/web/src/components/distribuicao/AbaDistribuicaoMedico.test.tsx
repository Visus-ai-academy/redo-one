import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { distribuicaoMedicoControllerObter } from '../../gen/clients/distribuicaoMedicoControllerObter';
import { distribuicaoMedicoControllerSalvarRobo } from '../../gen/clients/distribuicaoMedicoControllerSalvarRobo';
import { opcoesControllerListas } from '../../gen/clients/opcoesControllerListas';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { AbaDistribuicaoMedico } from './AbaDistribuicaoMedico';

vi.mock('../../gen/clients/distribuicaoMedicoControllerObter', () => ({
  distribuicaoMedicoControllerObter: vi.fn(),
}));
vi.mock('../../gen/clients/distribuicaoMedicoControllerSalvarRobo', () => ({
  distribuicaoMedicoControllerSalvarRobo: vi.fn(),
}));
vi.mock('../../gen/clients/opcoesControllerListas', () => ({
  opcoesControllerListas: vi.fn(),
}));

const obter = vi.mocked(distribuicaoMedicoControllerObter);
const salvarRobo = vi.mocked(distribuicaoMedicoControllerSalvarRobo);

beforeEach(() => {
  vi.mocked(opcoesControllerListas).mockReturnValue({
    unwrap: async () => ({
      modalidades: [{ id: 'm-tc', nome: 'TC', cor: null }],
      especialidades: [{ id: 'e-neuro', nome: 'NEURO', cor: null }],
      subespecialidades: [],
      categoriasExame: [],
      prioridades: [],
      contratados: [],
    }),
  } as never);
  obter.mockReturnValue({
    unwrap: async () => ({
      habilitadoRobo: false,
      unidadeTeto: 'exames',
      arranjos: [
        {
          especialidadeId: 'e-neuro',
          modalidadeIds: ['m-tc'],
          subespecialidadeIds: [],
          subespecialidadeGeral: false,
          prioridadeIds: [],
          modoClientes: 'todos',
          clienteIds: [],
          modoExames: 'todos',
          exameIds: [],
          clientesExclusivosIds: [],
        },
      ],
      clientes: [],
      exames: [],
      prioridades: [{ id: 'op-int', nome: 'INTERNADO', cor: '#8462A8' }],
    }),
  } as never);
  salvarRobo.mockReset();
  salvarRobo.mockReturnValue({ unwrap: async () => undefined } as never);
});

describe('AbaDistribuicaoMedico', () => {
  it('o editor de arranjo oferece as prioridades da operação, não as do catálogo', async () => {
    vi.mocked(opcoesControllerListas).mockReturnValue({
      unwrap: async () => ({
        modalidades: [],
        especialidades: [{ id: 'e-neuro', nome: 'NEURO', cor: null }],
        subespecialidades: [],
        categoriasExame: [],
        prioridades: [{ id: 'p-rot', nome: 'ROTINA DO CATÁLOGO', cor: null }],
        contratados: [],
      }),
    } as never);
    renderComRotas(<AbaDistribuicaoMedico medicoId="m1" podeEditar />);
    await userEvent.click(await screen.findByRole('button', { name: 'Novo arranjo' }));
    expect(screen.getByRole('checkbox', { name: 'INTERNADO' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'ROTINA DO CATÁLOGO' })).not.toBeInTheDocument();
  });

  it('habilita o médico no robô na hora, com o aviso', async () => {
    renderComRotas(<AbaDistribuicaoMedico medicoId="m1" podeEditar />);
    expect(await screen.findByText('NEURO')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Habilitado no robô' }));
    expect(salvarRobo).toHaveBeenCalledWith(
      expect.objectContaining({ path: { medicoId: 'm1' }, body: { habilitadoRobo: true } }),
    );
    expect(await acharAviso()).toHaveTextContent('Médico habilitado no robô.');
  });

  it('troca a unidade do teto na hora, com o aviso', async () => {
    renderComRotas(<AbaDistribuicaoMedico medicoId="m1" podeEditar />);
    const campo = await screen.findByRole('combobox', { name: 'Conta o teto por' });
    expect(campo).toHaveTextContent('Exames');
    await userEvent.click(campo);
    await userEvent.click(await screen.findByRole('option', { name: 'Laudos' }));
    expect(salvarRobo).toHaveBeenCalledWith(
      expect.objectContaining({ path: { medicoId: 'm1' }, body: { unidadeTeto: 'laudos' } }),
    );
    expect(await acharAviso()).toHaveTextContent('O teto passa a contar laudos.');
  });

  it('sem permissão de editar, a chave e os arranjos ficam só para leitura', async () => {
    renderComRotas(<AbaDistribuicaoMedico medicoId="m1" podeEditar={false} />);
    expect(await screen.findByText('NEURO')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Habilitado no robô' }));
    expect(salvarRobo).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Conta o teto por' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Novo arranjo' })).not.toBeInTheDocument();
  });
});
