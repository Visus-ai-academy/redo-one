import { describe, expect, it } from 'vitest';

import {
  ajusteVazio,
  ateMaximoDoAjuste,
  canonicaAjuste,
  diasDoPeriodoAjuste,
  MAX_DIAS_PERIODO_AJUSTE,
  validarAjusteDia,
} from './ajuste-dia';

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

describe('período do ajuste do dia ("Até")', () => {
  it('vai do dia aberto até o "Até", com as duas pontas, virando o mês', () => {
    expect(diasDoPeriodoAjuste('2026-11-29', '2026-12-02')).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ]);
    expect(diasDoPeriodoAjuste('2026-11-18', '2026-11-18')).toEqual(['2026-11-18']);
  });

  it('recusa "Até" antes do dia aberto ou além do limite', () => {
    expect(() => diasDoPeriodoAjuste('2026-11-18', '2026-11-17')).toThrow(/antes do dia/);
    expect(() => diasDoPeriodoAjuste('2026-11-18', '2026-11-31')).toThrow(/Até/);
    const ultimo = ateMaximoDoAjuste('2026-11-18');
    expect(diasDoPeriodoAjuste('2026-11-18', ultimo)).toHaveLength(MAX_DIAS_PERIODO_AJUSTE);
    expect(() => diasDoPeriodoAjuste('2026-11-18', '2026-12-31')).toThrow(
      new RegExp(`${MAX_DIAS_PERIODO_AJUSTE} dias`),
    );
  });
});
