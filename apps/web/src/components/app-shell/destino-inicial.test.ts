import { Users } from '@phosphor-icons/react';
import { describe, expect, it } from 'vitest';

import { destinoInicial } from './destino-inicial';
import type { GrupoMenu } from './menu';

// Rotas que já existem servem de destino; o que importa é o filtro por permissão.
const grupos: GrupoMenu[] = [
  {
    titulo: 'Acesso',
    itens: [
      { nome: 'Papéis', to: '/recuperar-senha', icone: Users, permissao: 'papeis.ver' },
      { nome: 'Usuários', to: '/configuracoes', icone: Users, permissao: 'usuarios.ver' },
    ],
  },
];

describe('destinoInicial', () => {
  it('abre a primeira tela de trabalho que o papel permite', () => {
    expect(destinoInicial({ acessoTotal: false, permissoes: ['usuarios.ver'] }, grupos)).toBe(
      '/configuracoes',
    );
  });

  it('sem tela de trabalho permitida, abre as Configurações', () => {
    expect(destinoInicial({ acessoTotal: false, permissoes: [] }, [])).toBe('/configuracoes');
  });
});
