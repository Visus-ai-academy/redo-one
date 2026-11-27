import { describe, expect, it } from 'vitest';

import { diasEntre, diaValido, hojeEmBrasilia } from './dias';

describe('dias', () => {
  it('hoje em Brasília vira o dia anterior antes das 3h UTC', () => {
    expect(hojeEmBrasilia(new Date('2026-11-28T02:59:00Z'))).toBe('2026-11-27');
    expect(hojeEmBrasilia(new Date('2026-11-28T03:00:00Z'))).toBe('2026-11-28');
  });

  it('dia válido só com o formato AAAA-MM-DD e uma data que existe', () => {
    expect(diaValido('2026-02-28')).toBe(true);
    expect(diaValido('2026-02-29')).toBe(false);
    expect(diaValido('28/02/2026')).toBe(false);
  });

  it('dias entre duas datas, atravessando meses', () => {
    expect(diasEntre('2026-10-10', '2026-11-27')).toBe(48);
    expect(diasEntre('2026-11-27', '2026-11-27')).toBe(0);
    expect(diasEntre('2026-11-28', '2026-11-27')).toBe(-1);
  });
});
