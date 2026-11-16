import { describe, expect, it } from 'vitest';

import { chaveEstudo, chaveEstudoLimpo } from './nome-estudo';

describe('chaveEstudo', () => {
  it('normaliza e tira os sufixos de multiplicidade do fim', () => {
    expect(chaveEstudo('TC SEIOS DA FACE X1 X6')).toBe('tc seios da face');
    expect(chaveEstudo('RM Crânio x3 ')).toBe('rm cranio');
  });

  it('mantém o X que não está no fim', () => {
    expect(chaveEstudo('RX TORAX X2 PA E PERFIL')).toBe('rx torax x2 pa e perfil');
  });

  it('tira X10 ou mais no fim', () => {
    expect(chaveEstudo('RX COLUNA X12')).toBe('rx coluna');
  });
});

describe('chaveEstudoLimpo (limparNomeExameLegado + normalização)', () => {
  it('tira X1 a X9 e XE em qualquer posição', () => {
    expect(chaveEstudoLimpo('RX TORAX X2 PA E PERFIL')).toBe('rx torax pa e perfil');
    expect(chaveEstudoLimpo('RM ABDOME SUPERIOR E ANGIORM X3')).toBe(
      'rm abdome superior e angiorm',
    );
    expect(chaveEstudoLimpo('TC TORAX XE')).toBe('tc torax');
  });

  it('não tira X10 ou mais, como o legado', () => {
    expect(chaveEstudoLimpo('RX COLUNA X12')).toBe('rx coluna x12');
  });

  it('não corta palavra que começa com X', () => {
    expect(chaveEstudoLimpo('RX XIFOIDE')).toBe('rx xifoide');
  });
});
