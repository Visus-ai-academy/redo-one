import { describe, expect, it } from 'vitest';

import {
  alternativasEm,
  PARAMETROS_INICIAIS,
  ParametrosInvalidosError,
  parametrosEm,
  validarAlternativa,
  versaoEm,
} from './parametros-demonstrativo';

const v = (desde: string | null, criadoEm: string, cobraDuplicados: boolean) => ({
  desde,
  criadoEm: new Date(criadoEm),
  ...PARAMETROS_INICIAIS,
  cobraDuplicados,
});

describe('versão vigente pela cadeia (só "desde", nada se sobrescreve)', () => {
  it('vale a de maior "desde" até a competência; sem "desde" vale desde sempre', () => {
    const versoes = [
      v(null, '2026-01-01', true),
      v('2026-11', '2026-10-01', false),
      v('2027-02', '2026-10-01', true),
    ];
    expect(versaoEm(versoes, '2026-10')?.cobraDuplicados).toBe(true);
    expect(versaoEm(versoes, '2026-11')?.cobraDuplicados).toBe(false);
    expect(versaoEm(versoes, '2027-01')?.cobraDuplicados).toBe(false);
    expect(versaoEm(versoes, '2027-02')?.cobraDuplicados).toBe(true);
  });

  it('no mesmo "desde", a criada por último vence (a anterior fica no histórico)', () => {
    const versoes = [v('2026-11', '2026-11-02', false), v('2026-11', '2026-11-03', true)];
    expect(versaoEm(versoes, '2026-12')?.cobraDuplicados).toBe(true);
  });

  it('sem versão até a competência, nulo', () => {
    expect(versaoEm([v('2026-11', '2026-11-02', false)], '2026-10')).toBeNull();
  });

  it('sem nenhuma versão, os parâmetros iniciais: cobra duplicados, não cobra inativos', () => {
    expect(parametrosEm([], '2026-10')).toEqual({
      cobraDuplicados: true,
      cobraClientesInativos: false,
      categoriaPadraoId: null,
      prioridadePadraoId: null,
    });
  });
});

describe('prioridade alternativa do preço', () => {
  const a = (prioridadeId: string, alternativaId: string | null, desde: string | null) => ({
    prioridadeId,
    alternativaId,
    desde,
    criadoEm: new Date('2026-11-01'),
  });

  it('cada prioridade tem a sua cadeia; "sem alternativa" encerra o par a partir do "desde"', () => {
    const versoes = [
      a('plantao', 'urgencia', null),
      a('urgencia', 'plantao', null),
      a('plantao', null, '2026-12'),
    ];
    expect([...alternativasEm(versoes, '2026-11')]).toEqual([
      ['plantao', 'urgencia'],
      ['urgencia', 'plantao'],
    ]);
    expect([...alternativasEm(versoes, '2026-12')]).toEqual([['urgencia', 'plantao']]);
  });

  it('a alternativa não pode ser a própria prioridade', () => {
    expect(() => validarAlternativa('p1', 'p1')).toThrow(ParametrosInvalidosError);
    expect(() => validarAlternativa('p1', null)).not.toThrow();
  });
});
