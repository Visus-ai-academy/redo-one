import { describe, expect, it } from 'vitest';

import {
  CONFIGURACAO_PADRAO,
  FAIXAS_PADRAO,
  faixaDoAtraso,
  prepararConfiguracao,
  prepararFaixas,
  rotuloDaFaixa,
} from './configuracao-financeira';
import { DadosInvalidosError } from './erros';

const campos = (fn: () => unknown) => {
  try {
    fn();
  } catch (erro) {
    if (erro instanceof DadosInvalidosError) return erro.detalhes.campos;
    throw erro;
  }
  return {};
};

describe('faixas da inadimplência', () => {
  it('o padrão é o do dashboards-one: 1–5, 6–15, 16–30 e mais de 30 dias', () => {
    expect(FAIXAS_PADRAO.map((_, i) => rotuloDaFaixa(FAIXAS_PADRAO, i))).toEqual([
      '1–5 dias',
      '6–15 dias',
      '16–30 dias',
      'Mais de 30 dias',
    ]);
  });

  it('cada atraso cai na faixa que começa no maior dia até ele', () => {
    expect(faixaDoAtraso(FAIXAS_PADRAO, 1)).toBe(0);
    expect(faixaDoAtraso(FAIXAS_PADRAO, 5)).toBe(0);
    expect(faixaDoAtraso(FAIXAS_PADRAO, 6)).toBe(1);
    expect(faixaDoAtraso(FAIXAS_PADRAO, 30)).toBe(2);
    expect(faixaDoAtraso(FAIXAS_PADRAO, 31)).toBe(3);
    expect(faixaDoAtraso(FAIXAS_PADRAO, 400)).toBe(3);
  });

  it('faixa de um dia só diz o dia', () => {
    expect(rotuloDaFaixa([1, 2, 10], 0)).toBe('1 dia');
    expect(rotuloDaFaixa([1, 2, 10], 1)).toBe('2–9 dias');
  });

  it('ordena e aceita de 2 a 8 faixas começando no dia 1, sem repetir', () => {
    expect(prepararFaixas([16, 1, 6, 31])).toEqual([1, 6, 16, 31]);
    expect(campos(() => prepararFaixas([2, 10]))).toEqual({
      faixasInadimplencia: 'A primeira faixa começa no dia 1 de atraso.',
    });
    expect(campos(() => prepararFaixas([1, 6, 6]))).toEqual({
      faixasInadimplencia: 'Cada faixa começa num dia diferente.',
    });
    expect(campos(() => prepararFaixas([1]))).toEqual({
      faixasInadimplencia: 'Use de 2 a 8 faixas.',
    });
    expect(campos(() => prepararFaixas([1, 0.5]))).toEqual({
      faixasInadimplencia: 'Os dias são números inteiros maiores que zero.',
    });
  });
});

describe('prepararConfiguracao', () => {
  it('o padrão: 3 meses de antecedência e o vencimento em fim de semana posterga', () => {
    expect(CONFIGURACAO_PADRAO).toMatchObject({
      horizonteRecorrenciaMeses: 3,
      ajusteDiaNaoUtil: 'posterga',
    });
  });

  it('horizonte de 1 a 24 meses', () => {
    expect(
      campos(() => prepararConfiguracao({ ...CONFIGURACAO_PADRAO, horizonteRecorrenciaMeses: 0 })),
    ).toEqual({ horizonteRecorrenciaMeses: 'Use de 1 a 24 meses.' });
    expect(
      prepararConfiguracao({ ...CONFIGURACAO_PADRAO, horizonteRecorrenciaMeses: 12 })
        .horizonteRecorrenciaMeses,
    ).toBe(12);
  });
});
