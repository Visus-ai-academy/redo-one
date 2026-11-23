import { describe, expect, it } from 'vitest';

import { comUnidade, moeda, numero, plural, porcentagem } from './formato';

const NBSP = ' ';

describe('plural', () => {
  const exames = { um: 'exame', varios: 'exames' };

  it('singular e plural com o número formatado', () => {
    expect(plural(1, exames)).toBe('1 exame');
    expect(plural(2, exames)).toBe('2 exames');
    expect(plural(1487, exames)).toBe('1.487 exames');
  });

  it('zero usa o texto de nenhum, quando há; senão o plural', () => {
    expect(plural(0, { ...exames, nenhum: 'Nenhum exame' })).toBe('Nenhum exame');
    expect(plural(0, exames)).toBe('0 exames');
  });
});

describe('moeda', () => {
  it('sempre com 2 casas, em reais', () => {
    expect(moeda(1234.5)).toBe(`R$${NBSP}1.234,50`);
    expect(moeda(40)).toBe(`R$${NBSP}40,00`);
  });

  it('negativos (débito, estorno) e milhões', () => {
    expect(moeda(-12.3)).toBe(`-R$${NBSP}12,30`);
    expect(moeda(2_500_000)).toBe(`R$${NBSP}2.500.000,00`);
  });
});

describe('numero', () => {
  it('com separador de milhar e as casas pedidas', () => {
    expect(numero(1234567)).toBe('1.234.567');
    expect(numero(1.236, 2)).toBe('1,24');
    expect(numero(3, 2)).toBe('3,00');
  });
});

describe('porcentagem', () => {
  it('da fração, com a mesma quantidade de casas sempre', () => {
    expect(porcentagem(0.125, 1)).toBe('12,5%');
    expect(porcentagem(0.1, 1)).toBe('10,0%');
    expect(porcentagem(0.5)).toBe('50%');
  });
});

describe('comUnidade', () => {
  it('espaço não separável entre o número e a unidade', () => {
    expect(comUnidade(12, 'min')).toBe(`12${NBSP}min`);
    expect(comUnidade(1500, 'laudos')).toBe(`1.500${NBSP}laudos`);
  });
});
