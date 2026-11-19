import { describe, expect, it } from 'vitest';

import { ajusteVazio, canonicaAjuste, validarAjusteDia } from './ajuste-dia';

const ajuste = (parcial = {}) => ({
  prioridadeIdsLiberadas: ['urg'],
  segueSla: false,
  clienteId: null,
  laudosExtra: 0,
  ...parcial,
});

describe('ajuste do dia da distribuição', () => {
  it('aceita prioridades liberadas, "segue o SLA neste dia" e o recorte por cliente', () => {
    expect(() => validarAjusteDia(ajuste())).not.toThrow();
    expect(() =>
      validarAjusteDia(ajuste({ prioridadeIdsLiberadas: [], segueSla: true, clienteId: 'c1' })),
    ).not.toThrow();
  });

  it('vazio (nada liberado e a Lista como sempre) é remover o ajuste', () => {
    expect(ajusteVazio(ajuste({ prioridadeIdsLiberadas: [] }))).toBe(true);
    expect(ajusteVazio(ajuste())).toBe(false);
  });

  it('recusa prioridade repetida e cliente sem nada para recortar', () => {
    expect(() => validarAjusteDia(ajuste({ prioridadeIdsLiberadas: ['u', 'u'] }))).toThrow(
      /prioridade repetida/,
    );
    expect(() => validarAjusteDia(ajuste({ prioridadeIdsLiberadas: [], clienteId: 'c1' }))).toThrow(
      /cliente só recorta/,
    );
  });

  it('+N laudos só de um cliente (o de todos é a produtividade do dia), inteiro de 0 a 500', () => {
    const extra = ajuste({ prioridadeIdsLiberadas: [], clienteId: 'c1', laudosExtra: 30 });
    expect(() => validarAjusteDia(extra)).not.toThrow();
    expect(ajusteVazio(extra)).toBe(false);
    expect(() => validarAjusteDia(ajuste({ laudosExtra: 30 }))).toThrow(/produtividade do dia/);
    for (const laudosExtra of [-1, 1.5, 501]) {
      expect(() => validarAjusteDia(ajuste({ clienteId: 'c1', laudosExtra }))).toThrow(/0 e 500/);
    }
  });

  it('canônico: prioridades ordenadas', () => {
    expect(
      canonicaAjuste(ajuste({ prioridadeIdsLiberadas: ['b', 'a'] })).prioridadeIdsLiberadas,
    ).toEqual(['a', 'b']);
  });
});
