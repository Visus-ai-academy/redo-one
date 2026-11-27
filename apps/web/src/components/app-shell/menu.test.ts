import { describe, expect, it } from 'vitest';

import { GRUPOS_MENU } from './menu';

describe('GRUPOS_MENU', () => {
  it('Cadastros tem Clientes, Médicos, Exames e Fornecedores, cada um exigindo o ver da tela', () => {
    const cadastros = GRUPOS_MENU.find((g) => g.titulo === 'Cadastros');
    expect(cadastros?.itens.map((i) => [i.nome, i.to, i.permissao])).toEqual([
      ['Clientes', '/clientes', 'clientes.ver'],
      ['Médicos', '/medicos', 'medicos.ver'],
      ['Exames', '/exames', 'exames.ver'],
      ['Fornecedores', '/fornecedores', 'fornecedores.ver'],
    ]);
  });

  it('Operação tem Importação, Distribuição, Escala e Ausências, cada um exigindo o ver da tela', () => {
    const operacao = GRUPOS_MENU.find((g) => g.titulo === 'Operação');
    expect(operacao?.itens.map((i) => [i.nome, i.to, i.permissao])).toEqual([
      ['Importação', '/importacao', 'importacao.ver'],
      ['Distribuição', '/distribuicao', 'distribuicao.ver'],
      ['Escala', '/escala', 'escala.ver'],
      ['Ausências', '/escala/ausencias', 'ausencias.ver'],
    ]);
  });

  it('Financeiro tem Faturamento, Repasse e Contas a pagar, cada um com a permissão ver', () => {
    const financeiro = GRUPOS_MENU.find((g) => g.titulo === 'Financeiro');
    expect(financeiro?.itens.map((i) => [i.nome, i.to, i.permissao])).toEqual([
      ['Faturamento', '/faturamento/competencias', 'faturamento.ver'],
      ['Repasse', '/repasse', 'repasse.ver'],
      ['Contas a pagar', '/contas-pagar', 'contas-pagar.ver'],
    ]);
  });
});
