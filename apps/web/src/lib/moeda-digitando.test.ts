import { describe, expect, it } from 'vitest';

import { centavosDaMoeda, formatarMoedaDigitando, textoDaMoeda } from './moeda-digitando';

describe('formatarMoedaDigitando', () => {
  it('põe o separador de milhar enquanto digita', () => {
    expect(formatarMoedaDigitando('1')).toBe('1');
    expect(formatarMoedaDigitando('1234')).toBe('1.234');
    expect(formatarMoedaDigitando('1234567')).toBe('1.234.567');
    expect(formatarMoedaDigitando('1.2345')).toBe('12.345');
  });

  it('aceita a vírgula dos centavos, no máximo duas casas', () => {
    expect(formatarMoedaDigitando('1234,')).toBe('1.234,');
    expect(formatarMoedaDigitando('1234,5')).toBe('1.234,5');
    expect(formatarMoedaDigitando('1234,567')).toBe('1.234,56');
    expect(formatarMoedaDigitando(',5')).toBe('0,5');
  });

  it('ignora letras, espaços e o "R$" colado', () => {
    expect(formatarMoedaDigitando('R$ 12a3')).toBe('123');
  });

  it('o ponto digitado é o do milhar: "1.200,50" digitado tecla a tecla chega lá', () => {
    let texto = '';
    for (const tecla of '1.200,50') texto = formatarMoedaDigitando(texto + tecla);
    expect(texto).toBe('1.200,50');
    expect(formatarMoedaDigitando('12.')).toBe('12');
  });

  it('apagar um dígito de "1.234" refaz o milhar, sem virar centavos', () => {
    expect(formatarMoedaDigitando('1.23')).toBe('123');
    expect(formatarMoedaDigitando('1.34')).toBe('134');
  });

  it('tira zeros à esquerda', () => {
    expect(formatarMoedaDigitando('007')).toBe('7');
    expect(formatarMoedaDigitando('0')).toBe('0');
  });

  it('só aceita o sinal de menos quando o campo deixa', () => {
    expect(formatarMoedaDigitando('-50')).toBe('50');
    expect(formatarMoedaDigitando('-50', { negativo: true })).toBe('-50');
    expect(formatarMoedaDigitando('−50', { negativo: true })).toBe('-50');
    expect(formatarMoedaDigitando('-', { negativo: true })).toBe('-');
  });
});

describe('centavosDaMoeda', () => {
  it('lê o texto do campo em centavos inteiros', () => {
    expect(centavosDaMoeda('1.234,56')).toBe(123456);
    expect(centavosDaMoeda('1.234,5')).toBe(123450);
    expect(centavosDaMoeda('1.234,')).toBe(123400);
    expect(centavosDaMoeda('0,01')).toBe(1);
    expect(centavosDaMoeda('-12,30')).toBe(-1230);
  });

  it('vazio ou só o sinal não é valor', () => {
    expect(centavosDaMoeda('')).toBeNull();
    expect(centavosDaMoeda('-')).toBeNull();
  });

  it('não perde centavo por arredondamento', () => {
    expect(centavosDaMoeda('0,29')).toBe(29);
    expect(centavosDaMoeda('1.000.000,07')).toBe(100000007);
  });
});

describe('textoDaMoeda', () => {
  it('mostra os centavos com duas casas e milhar', () => {
    expect(textoDaMoeda(123456)).toBe('1.234,56');
    expect(textoDaMoeda(5)).toBe('0,05');
    expect(textoDaMoeda(-1230)).toBe('-12,30');
    expect(textoDaMoeda(null)).toBe('');
  });

  it('ida e volta sem mudar o valor', () => {
    for (const c of [0, 1, 29, 99, 100, 123456, 100000007, -1, -1230]) {
      expect(centavosDaMoeda(textoDaMoeda(c))).toBe(c);
    }
  });
});
