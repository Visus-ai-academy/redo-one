import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { opcoesControllerListas } from '../../gen/clients/opcoesControllerListas';
import { prioridadesClienteControllerObter } from '../../gen/clients/prioridadesClienteControllerObter';
import { prioridadesClienteControllerSalvar } from '../../gen/clients/prioridadesClienteControllerSalvar';
import type { PrioridadeClienteDto } from '../../gen/types/PrioridadeClienteDto';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { escolherOpcao, escolherSegmento } from '../../test/select';
import { AbaDistribuicaoCliente } from './AbaDistribuicaoCliente';

vi.mock('../../gen/clients/opcoesControllerListas', () => ({ opcoesControllerListas: vi.fn() }));
vi.mock('../../gen/clients/prioridadesClienteControllerObter', () => ({
  prioridadesClienteControllerObter: vi.fn(),
}));
vi.mock('../../gen/clients/prioridadesClienteControllerSalvar', () => ({
  prioridadesClienteControllerSalvar: vi.fn(),
}));

const obter = vi.mocked(prioridadesClienteControllerObter);
const salvar = vi.mocked(prioridadesClienteControllerSalvar);
const com = (prioridades: PrioridadeClienteDto[]) =>
  obter.mockReturnValue({ unwrap: async () => ({ prioridades }) } as never);

beforeEach(() => {
  vi.mocked(opcoesControllerListas).mockReturnValue({
    unwrap: async () => ({
      modalidades: [{ id: 'm-ct', nome: 'CT', cor: null }],
      especialidades: [{ id: 'e-mi', nome: 'MEDICINA INTERNA', cor: null }],
      subespecialidades: [],
      categoriasExame: [],
      prioridades: [],
      contratados: [],
    }),
  } as never);
  com([{ especialidadeId: 'e-mi', modalidadeId: null, nivel: 1 }]);
  salvar.mockReset();
  salvar.mockReturnValue({ unwrap: async () => ({}) } as never);
});

describe('AbaDistribuicaoCliente', () => {
  it('sem editar, lista a frente e o nível', async () => {
    renderComRotas(<AbaDistribuicaoCliente clienteId="c-1" podeEditar={false} />);
    expect(await screen.findByText('MEDICINA INTERNA')).toBeInTheDocument();
    expect(screen.getByText('Alta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar prioridades' })).not.toBeInTheDocument();
  });

  it('sem nenhuma, diz que o cliente segue a fila comum', async () => {
    com([]);
    renderComRotas(<AbaDistribuicaoCliente clienteId="c-1" podeEditar={false} />);
    expect(await screen.findByText(/segue a ordem comum da fila/)).toBeInTheDocument();
  });

  it('acrescenta uma modalidade com nível Média e salva a lista inteira', async () => {
    renderComRotas(<AbaDistribuicaoCliente clienteId="c-1" podeEditar />);
    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar frente' }));
    await escolherOpcao('Frente 2', 'CT');
    await escolherSegmento('Nível da frente 2', 'Média');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar prioridades' }));
    expect(salvar).toHaveBeenCalledWith({
      path: { clienteId: 'c-1' },
      body: {
        prioridades: [
          { especialidadeId: 'e-mi', modalidadeId: null, nivel: 1 },
          { especialidadeId: null, modalidadeId: 'm-ct', nivel: 2 },
        ],
      },
    });
    expect(await acharAviso()).toHaveTextContent('Prioridades do cliente salvas.');
  });

  it('recusa frente repetida e frente vazia', async () => {
    renderComRotas(<AbaDistribuicaoCliente clienteId="c-1" podeEditar />);
    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar frente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar prioridades' }));
    expect(await screen.findByText('Escolha a especialidade ou a modalidade.')).toBeInTheDocument();
    await escolherOpcao('Frente 2', 'MEDICINA INTERNA');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar prioridades' }));
    expect(await screen.findByText('Esta frente já está na lista.')).toBeInTheDocument();
    expect(salvar).not.toHaveBeenCalled();
  });

  it('remove uma frente', async () => {
    renderComRotas(<AbaDistribuicaoCliente clienteId="c-1" podeEditar />);
    await userEvent.click(await screen.findByRole('button', { name: 'Remover frente 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar prioridades' }));
    expect(salvar).toHaveBeenCalledWith({ path: { clienteId: 'c-1' }, body: { prioridades: [] } });
  });
});
