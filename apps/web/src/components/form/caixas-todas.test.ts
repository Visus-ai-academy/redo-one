import { describe, expect, it } from 'vitest';

import {
  caixasDaApi,
  caixasParaApi,
  escolhidasAoMudar,
  esquemaCaixasComTodas,
  marcadasAoMudar,
  marcadasNaTela,
  TODAS,
} from './caixas-todas';

const todas = ['a', 'b', 'c'];

describe('marcadasNaTela', () => {
  it('"Todas" mostra todas as caixas marcadas', () => {
    expect(marcadasNaTela([TODAS], todas)).toEqual(todas);
  });

  it('lista explícita mostra só as marcadas', () => {
    expect(marcadasNaTela(['b'], todas)).toEqual(['b']);
  });

  it('vazio mostra tudo desmarcado, e não "Todas"', () => {
    expect(marcadasNaTela([], todas)).toEqual([]);
  });
});

describe('marcadasAoMudar', () => {
  it('desmarcar uma com "Todas" marcada guarda as demais', () => {
    expect(marcadasAoMudar(['a', 'c'], todas)).toEqual(['a', 'c']);
  });

  it('marcar uma a uma todas as opções vira "Todas"', () => {
    expect(marcadasAoMudar(['c', 'a', 'b'], todas)).toEqual([TODAS]);
  });

  it('desmarcar tudo fica vazio (inválido), e não "Todas"', () => {
    expect(marcadasAoMudar([], todas)).toEqual([]);
  });

  it('marcar uma depois de nada marcado guarda só ela', () => {
    expect(marcadasAoMudar(['b'], todas)).toEqual(['b']);
  });
});

describe('escolhidasAoMudar', () => {
  it('escolher "Todas" tira as outras', () => {
    expect(escolhidasAoMudar(['a'], ['a', TODAS])).toEqual([TODAS]);
  });

  it('escolher outra com "Todas" marcada tira "Todas"', () => {
    expect(escolhidasAoMudar([TODAS], [TODAS, 'b'])).toEqual(['b']);
  });

  it('desmarcar "Todas" fica vazio', () => {
    expect(escolhidasAoMudar([TODAS], [])).toEqual([]);
  });

  it('sem "Todas", só troca a lista', () => {
    expect(escolhidasAoMudar(['a'], ['a', 'b'])).toEqual(['a', 'b']);
  });
});

describe('esquemaCaixasComTodas', () => {
  const esquema = esquemaCaixasComTodas('Marque ao menos um dia.');

  it('aceita "Todas" e listas', () => {
    expect(esquema.safeParse([TODAS]).success).toBe(true);
    expect(esquema.safeParse(['a']).success).toBe(true);
  });

  it('recusa nada marcado com a mensagem do campo', () => {
    const resultado = esquema.safeParse([]);
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe('Marque ao menos um dia.');
  });
});

describe('ponte com a API', () => {
  it('"Todas" vira todas = true e lista vazia', () => {
    expect(caixasParaApi([TODAS])).toEqual({ todas: true, ids: [] });
  });

  it('lista vira todas = false e a lista', () => {
    expect(caixasParaApi(['a', 'b'])).toEqual({ todas: false, ids: ['a', 'b'] });
  });

  it('da API: todas = true vira "Todas"; senão, a lista', () => {
    expect(caixasDaApi(true, [])).toEqual([TODAS]);
    expect(caixasDaApi(false, ['a'])).toEqual(['a']);
  });
});
