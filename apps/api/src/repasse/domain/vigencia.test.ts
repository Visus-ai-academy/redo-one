import { describe, expect, it } from 'vitest';

import {
  aPartirDeMinimo,
  competenciaDestino,
  VigenciaRepasseInvalidaError,
  validarAPartirDe,
  vigenteEm,
} from './vigencia';

describe('vigenteEm', () => {
  it('vale entre desde e até, inclusivos; vazio = sem limite', () => {
    expect(vigenteEm({ vigenciaDesde: null, vigenciaAte: null }, '2026-10')).toBe(true);
    expect(vigenteEm({ vigenciaDesde: '2026-10', vigenciaAte: null }, '2026-09')).toBe(false);
    expect(vigenteEm({ vigenciaDesde: '2026-10', vigenciaAte: '2026-10' }, '2026-10')).toBe(true);
    expect(vigenteEm({ vigenciaDesde: null, vigenciaAte: '2026-09' }, '2026-10')).toBe(false);
  });
});

describe('validarAPartirDe', () => {
  const ctx = { mesAtual: '2026-11', bloqueadas: ['2026-09', '2026-10'] };

  it('aceita a competência depois da última fechada', () => {
    expect(aPartirDeMinimo(ctx)).toBe('2026-11');
    expect(() => validarAPartirDe('2026-11', ctx)).not.toThrow();
    expect(() => validarAPartirDe('2027-01', ctx)).not.toThrow();
  });

  it('recusa competência fechada e formato inválido', () => {
    expect(() => validarAPartirDe('2026-10', ctx)).toThrow(VigenciaRepasseInvalidaError);
    expect(() => validarAPartirDe('2026-13', ctx)).toThrow(VigenciaRepasseInvalidaError);
  });

  it('sem fechada, o mínimo é o mês atual', () => {
    expect(aPartirDeMinimo({ mesAtual: '2026-11', bloqueadas: [] })).toBe('2026-11');
  });
});

describe('competenciaDestino', () => {
  it('competência aberta fica como está', () => {
    expect(competenciaDestino('2026-11', ['2026-10'])).toBe('2026-11');
  });

  it('fechada vai para a próxima aberta', () => {
    expect(competenciaDestino('2026-09', ['2026-09', '2026-10'])).toBe('2026-11');
  });
});
