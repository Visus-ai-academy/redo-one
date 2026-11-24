import { describe, expect, it } from 'vitest';

import {
  CompetenciaJaAbertaError,
  CompetenciaJaFechadaError,
  fechar,
  reabrir,
} from './competencia-status';

describe('status da competência', () => {
  it('fecha a aberta', () => {
    expect(fechar('aberta')).toBe('fechada');
  });

  it('recusa fechar a já fechada', () => {
    expect(() => fechar('fechada')).toThrow(CompetenciaJaFechadaError);
  });

  it('reabre a fechada', () => {
    expect(reabrir('fechada')).toBe('aberta');
  });

  it('recusa reabrir a já aberta', () => {
    expect(() => reabrir('aberta')).toThrow(CompetenciaJaAbertaError);
  });
});
