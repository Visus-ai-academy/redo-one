import { describe, expect, it } from 'vitest';

import {
  CompetenciaJaAbertaError,
  CompetenciaJaFechadaError,
  destravar,
  fechar,
  ImportacaoJaTravadaError,
  ImportacaoNaoTravadaError,
  reabrir,
  travar,
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

  it('trava a importação destravada e recusa travar de novo', () => {
    expect(() => travar(false)).not.toThrow();
    expect(() => travar(true)).toThrow(ImportacaoJaTravadaError);
  });

  it('destrava a importação travada e recusa destravar a que não está travada', () => {
    expect(() => destravar(true)).not.toThrow();
    expect(() => destravar(false)).toThrow(ImportacaoNaoTravadaError);
  });
});
