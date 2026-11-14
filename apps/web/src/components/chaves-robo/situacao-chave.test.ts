import { describe, expect, it } from 'vitest';

import { situacaoDaChave } from './situacao-chave';

const AGORA = new Date('2026-11-14T15:00:00.000Z');
const chave = (expiraEm: string | null, revogadaEm: string | null = null) => ({
  expiraEm,
  revogadaEm,
});

describe('situacaoDaChave', () => {
  it('revogada vale mais que a validade', () => {
    expect(
      situacaoDaChave(chave('2027-01-01T00:00:00Z', '2026-11-01T00:00:00Z'), AGORA),
    ).toMatchObject({ rotulo: 'Revogada', tom: 'inativo', ativa: false });
  });

  it('vencida quando a validade passou', () => {
    expect(situacaoDaChave(chave('2026-11-14T14:59:00Z'), AGORA)).toMatchObject({
      rotulo: 'Vencida',
      tom: 'erro',
      ativa: false,
    });
  });

  it('avisa quando falta 30 dias ou menos, em dias inteiros', () => {
    expect(situacaoDaChave(chave('2026-11-26T15:00:00Z'), AGORA)).toMatchObject({
      rotulo: 'Vence em 12 dias',
      tom: 'atencao',
      ativa: true,
    });
    expect(situacaoDaChave(chave('2026-11-15T03:00:00Z'), AGORA).rotulo).toBe('Vence em 1 dia');
  });

  it('ativa com validade longa ou sem validade', () => {
    expect(situacaoDaChave(chave('2027-11-14T15:00:00Z'), AGORA)).toMatchObject({
      rotulo: 'Ativa',
      tom: 'sucesso',
      ativa: true,
    });
    expect(situacaoDaChave(chave(null), AGORA).rotulo).toBe('Ativa');
  });
});
