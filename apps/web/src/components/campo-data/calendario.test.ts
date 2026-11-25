import { describe, expect, it } from 'vitest';

import {
  dataDoTexto,
  diaComFoco,
  mascararData,
  moverPorTecla,
  rotuloDoDia,
  rotuloDoMes,
  semanasDoMes,
  textoDaData,
} from './calendario';

describe('semanasDoMes', () => {
  it('cobre o mês em semanas de segunda a domingo, com os dias vizinhos', () => {
    const semanas = semanasDoMes('2026-11');
    expect(semanas[0]).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(semanas.at(-1)?.at(-1)).toBe('2026-12-06');
    expect(semanas).toHaveLength(6);
  });

  it('não acrescenta semana vazia quando o mês fecha no domingo', () => {
    // Fevereiro de 2021: começa na segunda e termina no domingo.
    const semanas = semanasDoMes('2021-02');
    expect(semanas).toHaveLength(4);
    expect(semanas[0]?.[0]).toBe('2021-02-01');
    expect(semanas[3]?.[6]).toBe('2021-02-28');
  });
});

describe('textoDaData e dataDoTexto', () => {
  it('mostra a data como dd/mm/aaaa', () => {
    expect(textoDaData('2026-11-05')).toBe('05/11/2026');
    expect(textoDaData('')).toBe('');
  });

  it('lê dd/mm/aaaa completo e válido', () => {
    expect(dataDoTexto('05/11/2026')).toBe('2026-11-05');
    expect(dataDoTexto('29/02/2024')).toBe('2024-02-29');
  });

  it('recusa texto incompleto ou data que não existe', () => {
    expect(dataDoTexto('05/11/20')).toBeNull();
    expect(dataDoTexto('31/04/2026')).toBeNull();
    expect(dataDoTexto('29/02/2026')).toBeNull();
    expect(dataDoTexto('00/01/2026')).toBeNull();
    expect(dataDoTexto('10/13/2026')).toBeNull();
  });
});

describe('mascararData', () => {
  it('põe as barras enquanto digita e ignora o que não é número', () => {
    expect(mascararData('0')).toBe('0');
    expect(mascararData('051')).toBe('05/1');
    expect(mascararData('05112026')).toBe('05/11/2026');
    expect(mascararData('05/11/2026999')).toBe('05/11/2026');
    expect(mascararData('5a')).toBe('5');
  });
});

describe('moverPorTecla', () => {
  it('anda um dia nas setas laterais e uma semana nas verticais', () => {
    expect(moverPorTecla('2026-11-30', 'ArrowRight')).toBe('2026-12-01');
    expect(moverPorTecla('2026-11-01', 'ArrowLeft')).toBe('2026-10-31');
    expect(moverPorTecla('2026-11-25', 'ArrowDown')).toBe('2026-12-02');
    expect(moverPorTecla('2026-11-25', 'ArrowUp')).toBe('2026-11-18');
  });

  it('vai ao começo e ao fim da semana (segunda e domingo)', () => {
    // 25/11/2026 é quarta-feira.
    expect(moverPorTecla('2026-11-25', 'Home')).toBe('2026-11-23');
    expect(moverPorTecla('2026-11-25', 'End')).toBe('2026-11-29');
  });

  it('troca o mês com PageUp/PageDown e o ano com Shift, sem passar do fim do mês', () => {
    expect(moverPorTecla('2026-03-31', 'PageUp')).toBe('2026-02-28');
    expect(moverPorTecla('2026-01-31', 'PageDown')).toBe('2026-02-28');
    expect(moverPorTecla('2024-02-29', 'PageDown', { shift: true })).toBe('2025-02-28');
    expect(moverPorTecla('2026-11-25', 'PageUp', { shift: true })).toBe('2025-11-25');
  });

  it('não sai do intervalo permitido', () => {
    expect(moverPorTecla('2026-11-25', 'ArrowRight', { max: '2026-11-25' })).toBe('2026-11-25');
    expect(moverPorTecla('2026-11-25', 'PageUp', { min: '2026-11-10' })).toBe('2026-11-10');
  });

  it('devolve null para tecla que não navega', () => {
    expect(moverPorTecla('2026-11-25', 'a')).toBeNull();
  });
});

describe('diaComFoco', () => {
  it('é o valor, senão hoje, sempre dentro do intervalo', () => {
    expect(diaComFoco({ valor: '2026-03-10', hoje: '2026-11-25' })).toBe('2026-03-10');
    expect(diaComFoco({ valor: '', hoje: '2026-11-25' })).toBe('2026-11-25');
    expect(diaComFoco({ valor: '', hoje: '2026-11-25', min: '2026-12-01' })).toBe('2026-12-01');
    expect(diaComFoco({ valor: '', hoje: '2026-11-25', max: '2026-11-01' })).toBe('2026-11-01');
  });
});

describe('rótulos', () => {
  it('nomeia o mês e o dia em português', () => {
    expect(rotuloDoMes('2026-11')).toBe('Novembro de 2026');
    expect(rotuloDoDia('2026-11-25')).toBe('quarta-feira, 25 de novembro de 2026');
  });
});
