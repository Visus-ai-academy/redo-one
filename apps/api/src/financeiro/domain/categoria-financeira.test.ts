import { describe, expect, it } from 'vitest';

import { prepararCategoria } from './categoria-financeira';
import { DadosInvalidosError } from './erros';

const entrada = {
  tipo: 'despesa' as const,
  nome: '  Software e TI ',
  paiId: null,
  codigoContabil: ' 3.2.03 ',
  ativa: true,
};

function camposDoErro(f: () => unknown) {
  try {
    f();
  } catch (erro) {
    if (erro instanceof DadosInvalidosError) return erro.detalhes.campos;
    throw erro;
  }
  throw new Error('não lançou');
}

describe('prepararCategoria', () => {
  it('apara o nome e o código contábil; código vazio vira nulo', () => {
    expect(prepararCategoria(entrada, { pai: null, temFilhas: false })).toEqual({
      tipo: 'despesa',
      nome: 'Software e TI',
      paiId: null,
      codigoContabil: '3.2.03',
      ativa: true,
    });
    expect(
      prepararCategoria({ ...entrada, codigoContabil: '  ' }, { pai: null, temFilhas: false })
        .codigoContabil,
    ).toBeNull();
  });

  it('exige o nome', () => {
    expect(
      camposDoErro(() =>
        prepararCategoria({ ...entrada, nome: '   ' }, { pai: null, temFilhas: false }),
      ),
    ).toEqual({ nome: 'Informe o nome da categoria.' });
  });

  it('o grupo é do mesmo tipo e do nível de cima (dois níveis só)', () => {
    const comPai = { ...entrada, paiId: 'g1' };
    expect(
      camposDoErro(() =>
        prepararCategoria(comPai, {
          pai: { id: 'g1', tipo: 'receita', paiId: null },
          temFilhas: false,
        }),
      ),
    ).toEqual({ paiId: 'O grupo é de receitas: escolha um grupo de despesas.' });
    expect(
      camposDoErro(() =>
        prepararCategoria(comPai, {
          pai: { id: 'g1', tipo: 'despesa', paiId: 'g0' },
          temFilhas: false,
        }),
      ),
    ).toEqual({
      paiId: 'O grupo escolhido já está dentro de outro: escolha um grupo do nível de cima.',
    });
    expect(
      prepararCategoria(comPai, {
        pai: { id: 'g1', tipo: 'despesa', paiId: null },
        temFilhas: false,
      }).paiId,
    ).toBe('g1');
  });

  it('grupo com categorias dentro não entra em outro grupo nem muda de tipo', () => {
    expect(
      camposDoErro(() =>
        prepararCategoria(
          { ...entrada, paiId: 'g1' },
          { pai: { id: 'g1', tipo: 'despesa', paiId: null }, temFilhas: true },
        ),
      ),
    ).toEqual({
      paiId: 'A categoria tem categorias dentro dela: tire-as antes de pô-la num grupo.',
    });
    expect(
      camposDoErro(() =>
        prepararCategoria(entrada, { pai: null, temFilhas: true, tipoAtual: 'receita' }),
      ),
    ).toEqual({ tipo: 'A categoria tem categorias dentro dela: o tipo não muda.' });
  });

  it('grupo inexistente é recusado', () => {
    expect(
      camposDoErro(() =>
        prepararCategoria({ ...entrada, paiId: 'sumiu' }, { pai: null, temFilhas: false }),
      ),
    ).toEqual({ paiId: 'O grupo escolhido não existe mais. Escolha outro.' });
  });

  it('a categoria não é grupo dela mesma', () => {
    expect(
      camposDoErro(() =>
        prepararCategoria(
          { ...entrada, paiId: 'c1' },
          { id: 'c1', pai: { id: 'c1', tipo: 'despesa', paiId: null }, temFilhas: false },
        ),
      ),
    ).toEqual({ paiId: 'A categoria não pode ser o grupo dela mesma.' });
  });
});
