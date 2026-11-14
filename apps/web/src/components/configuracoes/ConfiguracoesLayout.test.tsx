import { Key, UserCircle, Users } from '@phosphor-icons/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderComRotas } from '../../test/render';
import { ConfiguracoesLayout } from './ConfiguracoesLayout';
import type { GrupoConfiguracoes } from './itens';

// Rotas que já existem servem de destino; o que importa é o filtro e o item atual.
const grupos: GrupoConfiguracoes[] = [
  {
    titulo: 'Sua conta',
    itens: [
      { nome: 'Meu perfil', descricao: '', icone: UserCircle, to: '/configuracoes' },
      {
        nome: 'Segurança',
        descricao: '',
        icone: UserCircle,
        to: '/configuracoes',
        hash: 'seguranca',
      },
    ],
  },
  {
    titulo: 'Acesso',
    itens: [
      { nome: 'Usuários', descricao: '', icone: Users, to: '/login', permissao: 'usuarios.ver' },
      {
        nome: 'Chaves dos robôs',
        descricao: '',
        icone: Key,
        to: '/login',
        permissao: 'chaves-robo.ver',
      },
    ],
  },
];

function montar(caminho = '/configuracoes') {
  return renderComRotas(
    <ConfiguracoesLayout
      acesso={{ acessoTotal: false, permissoes: ['usuarios.ver'] }}
      grupos={grupos}
    >
      <h1>Meu perfil</h1>
    </ConfiguracoesLayout>,
    { caminho },
  );
}

describe('ConfiguracoesLayout', () => {
  it('mostra o submenu só com o que o papel permite, ao lado do conteúdo', async () => {
    montar();

    const submenu = await screen.findByRole('navigation', { name: 'Configurações' });
    expect(within(submenu).getByRole('link', { name: 'Usuários' })).toBeInTheDocument();
    expect(
      within(submenu).queryByRole('link', { name: 'Chaves dos robôs' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Meu perfil' })).toBeInTheDocument();
  });

  it('volta para a central e marca a tela atual', async () => {
    montar();

    const submenu = await screen.findByRole('navigation', { name: 'Configurações' });
    expect(
      within(submenu).getByRole('link', { name: 'Voltar para Configurações' }),
    ).toHaveAttribute('href', '/configuracoes');
    expect(within(submenu).getByRole('link', { name: 'Meu perfil' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('na âncora de Segurança, só Segurança fica marcado', async () => {
    montar('/configuracoes#seguranca');

    const submenu = await screen.findByRole('navigation', { name: 'Configurações' });
    expect(within(submenu).getByRole('link', { name: 'Segurança' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(submenu).getByRole('link', { name: 'Meu perfil' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
