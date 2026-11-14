import { Key, UserCircle, Users } from '@phosphor-icons/react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { renderComRotas } from '../../test/render';
import { CentralConfiguracoes } from './CentralConfiguracoes';
import type { GrupoConfiguracoes } from './itens';

// Rotas que já existem servem de destino; o que importa é o filtro e a busca.
const grupos: GrupoConfiguracoes[] = [
  {
    titulo: 'Sua conta',
    itens: [
      {
        nome: 'Meu perfil',
        descricao: 'Nome, e-mail e CPF',
        icone: UserCircle,
        to: '/configuracoes',
      },
    ],
  },
  {
    titulo: 'Acesso',
    itens: [
      {
        nome: 'Usuários',
        descricao: 'Convidar, trocar papel, bloquear',
        icone: Users,
        to: '/configuracoes',
        permissao: 'usuarios.ver',
      },
      {
        nome: 'Chaves dos robôs',
        descricao: 'Importação, distribuição e comentários',
        icone: Key,
        to: '/configuracoes',
        permissao: 'chaves-robo.ver',
      },
    ],
  },
];

const financeiro = { acessoTotal: false, permissoes: ['usuarios.ver'] };

describe('CentralConfiguracoes', () => {
  it('lista por assunto só o que o papel permite', async () => {
    renderComRotas(<CentralConfiguracoes acesso={financeiro} grupos={grupos} />);

    const acesso = await screen.findByRole('region', { name: 'Acesso' });
    expect(within(acesso).getByRole('link', { name: /Usuários/ })).toBeInTheDocument();
    expect(
      within(acesso).queryByRole('link', { name: /Chaves dos robôs/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sua conta' })).toBeInTheDocument();
  });

  it('busca pelo nome ou pela descrição', async () => {
    renderComRotas(<CentralConfiguracoes acesso={financeiro} grupos={grupos} />);

    await userEvent.type(await screen.findByLabelText('Buscar configuração'), 'cpf');

    expect(screen.getByRole('link', { name: /Meu perfil/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Usuários/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Acesso' })).not.toBeInTheDocument();
  });

  it('diz quando a busca não acha nada', async () => {
    renderComRotas(<CentralConfiguracoes acesso={financeiro} grupos={grupos} />);

    await userEvent.type(await screen.findByLabelText('Buscar configuração'), 'xyz');

    expect(screen.getByText('Nenhuma configuração encontrada para “xyz”.')).toBeInTheDocument();
  });
});
