import { describe, expect, it } from 'vitest';

import { variaveisDoConfig } from './variaveis-ambiente-config';

describe('variaveisDoConfig', () => {
  it('existe só com valor não vazio', () => {
    const valores: Record<string, string> = { A: 'x', B: '  ' };
    const v = variaveisDoConfig({ get: ((nome: string) => valores[nome]) as never });
    expect([v.existe('A'), v.existe('B'), v.existe('C')]).toEqual([true, false, false]);
  });
});
