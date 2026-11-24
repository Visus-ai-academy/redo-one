import { describe, expect, it } from 'vitest';

import { buscarConfiguracoes, GRUPOS_CONFIGURACOES } from './itens';

const destinos = () =>
  GRUPOS_CONFIGURACOES.flatMap((g) => g.itens).map((i) => `${i.to}#${i.hash ?? ''}`);

describe('GRUPOS_CONFIGURACOES', () => {
  it('cada item leva a um lugar diferente (nada de dois itens para a mesma tela)', () => {
    expect(new Set(destinos()).size).toBe(destinos().length);
  });

  it('Sua conta tem só Meu perfil, que reúne dados, senha, sessões e acessos', () => {
    const conta = GRUPOS_CONFIGURACOES.find((g) => g.titulo === 'Sua conta');
    expect(conta?.itens.map((i) => [i.nome, i.descricao])).toEqual([
      ['Meu perfil', 'Dados, senha, sessões e acessos'],
    ]);
  });
});

describe('grupo Acesso', () => {
  it('tem Usuários e Papéis, cada um exigindo o ver da própria tela', () => {
    const acesso = GRUPOS_CONFIGURACOES.find((g) => g.titulo === 'Acesso');
    expect(acesso?.itens.map((i) => [i.nome, i.to, i.permissao])).toEqual([
      ['Usuários', '/configuracoes/usuarios', 'usuarios.ver'],
      ['Papéis', '/configuracoes/papeis', 'papeis.ver'],
    ]);
  });
});

describe('grupo Catálogo', () => {
  it('tem as listas do catálogo e as dos médicos, cada uma exigindo o ver da tela', () => {
    const catalogo = GRUPOS_CONFIGURACOES.find((g) => g.titulo === 'Catálogo');
    expect(catalogo?.itens.map((i) => [i.nome, i.to, i.permissao])).toEqual([
      ['Classificação dos exames', '/configuracoes/catalogo', 'catalogo.ver'],
      ['Contratados', '/configuracoes/contratados', 'catalogo.ver'],
      ['De-paras', '/configuracoes/de-paras', 'de-para.ver'],
      ['Equipes médicas', '/configuracoes/equipes', 'medicos.ver'],
      ['Níveis dos médicos', '/configuracoes/niveis-medico', 'medicos.ver'],
    ]);
  });
});

describe('buscarConfiguracoes', () => {
  it('ignora acento e maiúscula e acha pela descrição', () => {
    const achados = buscarConfiguracoes(GRUPOS_CONFIGURACOES, 'SESSÕES');
    expect(achados.flatMap((g) => g.itens.map((i) => i.nome))).toEqual(['Meu perfil']);
  });
});

describe('grupo Operação', () => {
  it('tem a importação de laudos, a escala e a distribuição, cada uma com o ver da sua configuração', () => {
    const operacao = GRUPOS_CONFIGURACOES.find((g) => g.titulo === 'Operação');
    expect(operacao?.itens.map((i) => [i.nome, i.to, i.permissao])).toEqual([
      ['Importação de laudos', '/configuracoes/importacao', 'importacao.ver'],
      ['Escala', '/configuracoes/escala', 'escala-config.ver'],
      ['Distribuição', '/configuracoes/distribuicao', 'distribuicao-config.ver'],
    ]);
  });
});

describe('grupo Financeiro', () => {
  it('tem o Faturamento (corte da competência), com o ver do faturamento', () => {
    const financeiro = GRUPOS_CONFIGURACOES.find((g) => g.titulo === 'Financeiro');
    expect(financeiro?.itens.map((i) => [i.nome, i.to, i.permissao])).toEqual([
      ['Faturamento', '/configuracoes/faturamento', 'faturamento.ver'],
    ]);
  });
});
