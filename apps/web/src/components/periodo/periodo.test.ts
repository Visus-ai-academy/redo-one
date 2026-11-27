import { describe, expect, it } from 'vitest';

import {
  ATALHOS_PROXIMOS,
  ATALHOS_ULTIMOS,
  atalhoDoPeriodo,
  periodoDoAtalho,
  rotuloDoIntervalo,
} from './periodo';

const hoje = '2026-11-16';
const atalho = (lista: typeof ATALHOS_PROXIMOS, valor: string) => {
  const achado = lista.find((a) => a.valor === valor);
  if (!achado) throw new Error(`sem o atalho ${valor}`);
  return achado;
};

describe('periodoDoAtalho', () => {
  it('próximos N dias: de hoje até hoje + N', () => {
    expect(periodoDoAtalho(atalho(ATALHOS_PROXIMOS, 'hoje'), hoje)).toEqual({
      de: hoje,
      ate: hoje,
    });
    expect(periodoDoAtalho(atalho(ATALHOS_PROXIMOS, '7'), hoje)).toEqual({
      de: hoje,
      ate: '2026-11-23',
    });
    expect(periodoDoAtalho(atalho(ATALHOS_PROXIMOS, '90'), hoje)).toEqual({
      de: hoje,
      ate: '2027-02-14',
    });
  });

  it('últimos N dias: de hoje − N até hoje', () => {
    expect(periodoDoAtalho(atalho(ATALHOS_ULTIMOS, '7'), hoje)).toEqual({
      de: '2026-11-09',
      ate: hoje,
    });
    expect(periodoDoAtalho(atalho(ATALHOS_ULTIMOS, '30'), hoje)).toEqual({
      de: '2026-10-17',
      ate: hoje,
    });
  });
});

describe('atalhoDoPeriodo', () => {
  it('reconhece o atalho, o vazio e o personalizado', () => {
    expect(atalhoDoPeriodo({ de: undefined, ate: undefined }, ATALHOS_PROXIMOS, hoje)).toBe('');
    expect(atalhoDoPeriodo({ de: hoje, ate: '2026-12-16' }, ATALHOS_PROXIMOS, hoje)).toBe('30');
    expect(atalhoDoPeriodo({ de: '2026-11-09', ate: hoje }, ATALHOS_ULTIMOS, hoje)).toBe('7');
    expect(atalhoDoPeriodo({ de: '2026-11-01', ate: '2026-11-30' }, ATALHOS_PROXIMOS, hoje)).toBe(
      'personalizado',
    );
  });
});

describe('rotuloDoIntervalo', () => {
  it('diz o intervalo curto, com o ano só fora do ano corrente', () => {
    expect(rotuloDoIntervalo({ de: '2026-12-05', ate: '2026-12-12' }, hoje)).toBe('05/12 a 12/12');
    expect(rotuloDoIntervalo({ de: '2026-12-05', ate: '2026-12-05' }, hoje)).toBe('05/12');
    expect(rotuloDoIntervalo({ de: '2026-12-05', ate: undefined }, hoje)).toBe('A partir de 05/12');
    expect(rotuloDoIntervalo({ de: undefined, ate: '2027-01-02' }, hoje)).toBe('Até 02/01/2027');
  });
});
