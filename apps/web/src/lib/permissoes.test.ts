import { describe, expect, it } from 'vitest';

import { filtrarPorPermissao, pode } from './permissoes';

const financeiro = { acessoTotal: false, permissoes: ['faturamento.ver', 'usuarios.ver'] };
const administrador = { acessoTotal: true, permissoes: [] };

describe('pode', () => {
  it('libera só as permissões do papel', () => {
    expect(pode(financeiro, 'usuarios.ver')).toBe(true);
    expect(pode(financeiro, 'papeis.ver')).toBe(false);
  });

  it('libera tudo para o Administrador', () => {
    expect(pode(administrador, 'papeis.editar')).toBe(true);
  });

  it('libera item sem permissão exigida para qualquer sessão', () => {
    expect(pode(financeiro, undefined)).toBe(true);
  });
});

describe('filtrarPorPermissao', () => {
  const grupos = [
    {
      titulo: 'Acesso',
      itens: [
        { nome: 'Usuários', permissao: 'usuarios.ver' },
        { nome: 'Papéis', permissao: 'papeis.ver' },
      ],
    },
    { titulo: 'Financeiro', itens: [{ nome: 'Repasse', permissao: 'repasse.ver' }] },
  ];

  it('tira os itens não permitidos e os grupos que ficam vazios', () => {
    expect(filtrarPorPermissao(grupos, financeiro)).toEqual([
      { titulo: 'Acesso', itens: [{ nome: 'Usuários', permissao: 'usuarios.ver' }] },
    ]);
  });

  it('mantém tudo para o Administrador', () => {
    expect(filtrarPorPermissao(grupos, administrador)).toEqual(grupos);
  });
});
