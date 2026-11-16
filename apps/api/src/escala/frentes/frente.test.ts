import { describe, expect, it } from 'vitest';

import { EscalaInvalidaError } from '../domain/errors';
import { destinoDaFrente } from './frente';

describe('destinoDaFrente', () => {
  it('frente de especialidade aponta só para a especialidade', () => {
    expect(
      destinoDaFrente({ tipo: 'especialidade', especialidadeId: 'e-1', modalidadeId: null }),
    ).toEqual({ tipo: 'especialidade', id: 'e-1' });
  });

  it('frente de modalidade aponta só para a modalidade', () => {
    expect(
      destinoDaFrente({ tipo: 'modalidade', especialidadeId: null, modalidadeId: 'm-1' }),
    ).toEqual({ tipo: 'modalidade', id: 'm-1' });
  });

  it.each([
    [{ tipo: 'especialidade', especialidadeId: null, modalidadeId: null }],
    [{ tipo: 'especialidade', especialidadeId: 'e-1', modalidadeId: 'm-1' }],
    [{ tipo: 'especialidade', especialidadeId: null, modalidadeId: 'm-1' }],
    [{ tipo: 'modalidade', especialidadeId: 'e-1', modalidadeId: null }],
    [{ tipo: 'modalidade', especialidadeId: 'e-1', modalidadeId: 'm-1' }],
  ] as const)('recusa destino que não bate com o tipo (%o)', (dados) => {
    expect(() => destinoDaFrente(dados)).toThrow(EscalaInvalidaError);
  });

  it('a mensagem diz o que falta', () => {
    expect(() =>
      destinoDaFrente({ tipo: 'modalidade', especialidadeId: null, modalidadeId: null }),
    ).toThrow('A frente de modalidade precisa de uma modalidade, e só dela.');
  });
});
