import { describe, expect, it } from 'vitest';

import { GRUPOS_MENU } from './menu';

describe('GRUPOS_MENU', () => {
  it('Cadastros tem Clientes, Médicos e Exames, cada um exigindo o ver da tela', () => {
    const cadastros = GRUPOS_MENU.find((g) => g.titulo === 'Cadastros');
    expect(cadastros?.itens.map((i) => [i.nome, i.to, i.permissao])).toEqual([
      ['Clientes', '/clientes', 'clientes.ver'],
      ['Médicos', '/medicos', 'medicos.ver'],
      ['Exames', '/exames', 'exames.ver'],
    ]);
  });
});
