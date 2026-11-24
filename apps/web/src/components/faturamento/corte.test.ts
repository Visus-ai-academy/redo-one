import { describe, expect, it } from 'vitest';

import {
  type CamposCorte,
  corpoDaVigencia,
  fraseDoCorte,
  opcoesDeDesde,
  periodoDaCompetencia,
  textoDaPrevia,
  valoresIniciais,
  vigenciaEmVigor,
} from './corte';

const PADRAO: CamposCorte = { dia: 7, ultimoDia: false, mes: 'seguinte', consideraExame: true };
const SROSALIA: CamposCorte = { dia: 25, ultimoDia: false, mes: 'proprio', consideraExame: false };

const vigencia = (desde: string, campos: Partial<CamposCorte> & { usaPadrao?: boolean } = {}) => ({
  id: desde,
  clienteId: null,
  desde,
  usaPadrao: false,
  ...PADRAO,
  criadoEm: '2026-11-20T12:00:00.000Z',
  criadoPor: 'Ana',
  ...campos,
});

describe('fraseDoCorte', () => {
  it('o padrão de hoje: de 08 de um mês a 07 do seguinte, considerando a data do exame', () => {
    expect(fraseDoCorte(PADRAO)).toBe(
      'Laudos assinados de 08 de um mês a 07 do seguinte; considera a data do exame',
    );
  });

  it('corte no próprio mês, só pela data do laudo', () => {
    expect(fraseDoCorte(SROSALIA)).toBe(
      'Laudos assinados de 26 do mês anterior a 25 do próprio mês; só a data do laudo conta',
    );
  });

  it('último dia (e o dia 31, que é sempre o último) vira o mês inteiro', () => {
    const ultimo = { ...PADRAO, dia: null, ultimoDia: true, mes: 'proprio' as const };
    expect(fraseDoCorte(ultimo)).toBe(
      'Laudos assinados de 01 ao último dia do próprio mês; considera a data do exame',
    );
    expect(fraseDoCorte({ ...ultimo, dia: 31, ultimoDia: false, mes: 'seguinte' })).toBe(
      'Laudos assinados de 01 ao último dia do mês seguinte; considera a data do exame',
    );
  });
});

describe('fraseDoCorte com dias que nem todo mês tem', () => {
  it('dia 28 a 30 não cita dia inexistente (31, 29 de fevereiro)', () => {
    expect(fraseDoCorte({ ...SROSALIA, dia: 30 })).toBe(
      'Laudos assinados do dia seguinte ao dia 30 do mês anterior até o dia 30 do próprio mês (ou o último dia, no mês mais curto); só a data do laudo conta',
    );
    expect(fraseDoCorte({ ...PADRAO, dia: 28 })).toBe(
      'Laudos assinados do dia seguinte ao dia 28 de um mês até o dia 28 do seguinte (ou o último dia, no mês mais curto); considera a data do exame',
    );
  });
});

describe('periodoDaCompetencia', () => {
  it('padrão: 12/2026 vai de 08/12/2026 a 07/01/2027 (virada do ano)', () => {
    expect(periodoDaCompetencia('2026-12', PADRAO)).toEqual({
      inicio: '08/12/2026',
      fim: '07/01/2027',
    });
  });

  it('dia 25 no próprio mês: 01/2027 vai de 26/12/2026 a 25/01/2027', () => {
    expect(periodoDaCompetencia('2027-01', SROSALIA)).toEqual({
      inicio: '26/12/2026',
      fim: '25/01/2027',
    });
  });

  it('dia maior que o mês vale o último dia (30 em fevereiro = 28)', () => {
    const dia30 = { ...SROSALIA, dia: 30 };
    expect(periodoDaCompetencia('2027-02', dia30)).toEqual({
      inicio: '31/01/2027',
      fim: '28/02/2027',
    });
    expect(periodoDaCompetencia('2027-03', dia30)).toEqual({
      inicio: '01/03/2027',
      fim: '30/03/2027',
    });
  });

  it('último dia no próprio mês: o mês inteiro, inclusive fevereiro bissexto', () => {
    const ultimo = { ...SROSALIA, dia: null, ultimoDia: true };
    expect(periodoDaCompetencia('2028-02', ultimo)).toEqual({
      inicio: '01/02/2028',
      fim: '29/02/2028',
    });
  });
});

describe('vigenciaEmVigor', () => {
  it('a de maior "desde" que já começou; as futuras ficam de fora', () => {
    const lista = [vigencia('2027-01'), vigencia('2026-11'), vigencia('2000-01')];
    expect(vigenciaEmVigor(lista, '2026-12')?.desde).toBe('2026-11');
    expect(vigenciaEmVigor(lista, '2027-01')?.desde).toBe('2027-01');
    expect(vigenciaEmVigor([vigencia('2027-01')], '2026-12')).toBeUndefined();
  });
});

describe('opcoesDeDesde', () => {
  it('do mês seguinte à última fechada até 12 meses à frente, sem os meses que já têm vigência', () => {
    const opcoes = opcoesDeDesde({
      ultimaFechada: '2026-10',
      maisAntiga: '2024-01',
      mesAtual: '2026-11',
      ocupados: ['2026-12'],
    });
    expect(opcoes[0]).toBe('2026-11');
    expect(opcoes).not.toContain('2026-12');
    expect(opcoes.at(-1)).toBe('2027-11');
    expect(opcoes).toHaveLength(12);
  });

  it('sem nenhuma fechada, começa na competência mais antiga (ou no mês atual, sem nenhuma)', () => {
    expect(
      opcoesDeDesde({
        ultimaFechada: null,
        maisAntiga: '2026-09',
        mesAtual: '2026-11',
        ocupados: [],
      })[0],
    ).toBe('2026-09');
    expect(
      opcoesDeDesde({
        ultimaFechada: null,
        maisAntiga: null,
        mesAtual: '2026-11',
        ocupados: [],
      })[0],
    ).toBe('2026-11');
  });
});

describe('valoresIniciais e corpoDaVigencia', () => {
  it('parte do corte em vigor e manda o corte inteiro', () => {
    const valores = { ...valoresIniciais(PADRAO), desde: '2026-12' };
    expect(valores).toEqual({
      desde: '2026-12',
      usaPadrao: false,
      dia: '7',
      mes: 'seguinte',
      consideraExame: true,
    });
    expect(corpoDaVigencia({ ...valores, dia: 'ultimo' }, 'c-1')).toEqual({
      clienteId: 'c-1',
      desde: '2026-12',
      usaPadrao: false,
      dia: null,
      ultimoDia: true,
      mes: 'seguinte',
      consideraExame: true,
    });
  });

  it('"usar o padrão" manda só o desde, sem os campos do corte', () => {
    const valores = { ...valoresIniciais(SROSALIA), desde: '2027-01', usaPadrao: true };
    expect(corpoDaVigencia(valores, 'c-1')).toEqual({
      clienteId: 'c-1',
      desde: '2027-01',
      usaPadrao: true,
      dia: null,
      ultimoDia: false,
      mes: null,
      consideraExame: null,
    });
  });
});

describe('textoDaPrevia', () => {
  it('diz quantos laudos mudam, no singular e no plural', () => {
    expect(textoDaPrevia(0)).toBe('Nenhum laudo muda de competência.');
    expect(textoDaPrevia(1)).toBe('1 laudo muda de competência.');
    expect(textoDaPrevia(1200)).toBe('1.200 laudos mudam de competência.');
  });
});
