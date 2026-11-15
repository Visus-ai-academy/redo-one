import { describe, expect, it } from 'vitest';

import { REGRA_MODALIDADE } from './regras';

describe('REGRA_MODALIDADE', () => {
  it('guarda a origem em maiúsculas, que é como o código chega e é comparado', async () => {
    const d = await REGRA_MODALIDADE.normalizar({
      origem: ' bmd ',
      modalidadeId: 'm',
      ativo: true,
    });

    expect(d.origem).toBe('BMD');
    expect(REGRA_MODALIDADE.chave(d)).toBe('BMD');
  });
});
