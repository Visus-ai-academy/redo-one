import { describe, expect, it } from 'vitest';

import { RESERVA_DO_PAINEL } from './reserva';

describe('RESERVA_DO_PAINEL', () => {
  it('reserva a faixa do painel aberto: 400px no padrão e 720px no largo, menos a margem', () => {
    expect(RESERVA_DO_PAINEL).toContain(
      "lg:[body:has([data-painel-lateral='padrao']:not([data-ending-style]))_&]:pr-[392px]",
    );
    expect(RESERVA_DO_PAINEL).toContain(
      "lg:[body:has([data-painel-lateral='larga']:not([data-ending-style]))_&]:pr-[712px]",
    );
  });
});
