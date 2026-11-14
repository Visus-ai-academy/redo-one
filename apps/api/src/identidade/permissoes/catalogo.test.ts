import { describe, expect, it } from 'vitest';

import { CATALOGO_PERMISSOES, existePermissao, normalizarPermissoes } from './catalogo';

describe('catálogo de permissões', () => {
  it('toda tela começa pela ação ver, e as chaves são únicas', () => {
    const chaves = CATALOGO_PERMISSOES.flatMap((t) => t.acoes.map((a) => a.chave));

    for (const tela of CATALOGO_PERMISSOES) {
      expect(tela.acoes[0]?.chave).toBe(`${tela.tela}.ver`);
      for (const acao of tela.acoes) expect(acao.chave.startsWith(`${tela.tela}.`)).toBe(true);
    }
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('reconhece só as chaves do catálogo', () => {
    expect(existePermissao('usuarios.desbloquear')).toBe(true);
    expect(existePermissao('usuarios.apagar-tudo')).toBe(false);
  });

  it('tem as telas do catálogo e dos de-paras na área Configurações', () => {
    for (const chave of ['catalogo.ver', 'catalogo.editar', 'de-para.ver', 'de-para.editar']) {
      expect(existePermissao(chave)).toBe(true);
    }
    const areas = CATALOGO_PERMISSOES.filter((t) => ['catalogo', 'de-para'].includes(t.tela)).map(
      (t) => t.area,
    );
    expect(areas).toEqual(['Configurações', 'Configurações']);
  });

  it('normaliza: acrescenta o ver da tela, tira repetição e ordena', () => {
    expect(
      normalizarPermissoes([
        'repasse.fechar',
        'faturamento.ver',
        'repasse.fechar',
        'inexistente.x',
      ]),
    ).toEqual(['faturamento.ver', 'repasse.fechar', 'repasse.ver']);
  });
});
