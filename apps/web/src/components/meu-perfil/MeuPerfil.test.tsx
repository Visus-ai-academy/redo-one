import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { MinhaContaDto } from '../../gen/types/MinhaContaDto';
import { renderComRotas } from '../../test/render';
import { MeuPerfil } from './MeuPerfil';

vi.mock('../../gen/clients/contaControllerAtualizar');
vi.mock('../../gen/clients/contaControllerTrocarSenha');
vi.mock('../../gen/clients/contaControllerEncerrarSessao');
vi.mock('../../gen/clients/contaControllerEncerrarOutrasSessoes');

const conta: MinhaContaDto = {
  nome: 'Carlos Andrade',
  email: 'carlos@empresa.com.br',
  cpfFinal: null,
  papel: { id: 'p', nome: 'Administrador' },
  senhaAlteradaEm: null,
  sessoesAbertas: [],
};

describe('MeuPerfil', () => {
  it('mostra quem é a conta e as seções', async () => {
    renderComRotas(<MeuPerfil conta={conta} acessos={[]} />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Meu perfil' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Carlos Andrade, Administrador')).toBeInTheDocument();
    expect(screen.getByText('CA')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Dados da conta' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Senha' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Sessões abertas/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Acessos recentes' })).toBeInTheDocument();
  });
});
