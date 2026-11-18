import { describe, expect, it } from 'vitest';

import { ajusteVazio, canonicaAjuste, validarAjusteDia } from './ajuste-dia';

const ajuste = (parcial = {}) => ({
  prioridadeIdsLiberadas: ['urg'],
  listaSegueSla: false,
  clienteId: null,
  ...parcial,
});

describe('ajuste do dia da distribuição', () => {
  it('aceita prioridades liberadas, "a Lista segue o SLA" e o recorte por cliente', () => {
    expect(() => validarAjusteDia(ajuste())).not.toThrow();
    expect(() =>
      validarAjusteDia(
        ajuste({ prioridadeIdsLiberadas: [], listaSegueSla: true, clienteId: 'c1' }),
      ),
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

  it('canônico: prioridades ordenadas', () => {
    expect(
      canonicaAjuste(ajuste({ prioridadeIdsLiberadas: ['b', 'a'] })).prioridadeIdsLiberadas,
    ).toEqual(['a', 'b']);
  });
});
