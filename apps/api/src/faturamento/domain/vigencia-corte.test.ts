import { describe, expect, it } from 'vitest';

import {
  CompetenciaInvalidaError,
  camposDoCorte,
  corteDaEntrada,
  exigirCompetencia,
  mesAcabou,
  mesAno,
  VigenciaInvalidaError,
  validarDesde,
} from './vigencia-corte';

const entrada = {
  clienteId: null,
  usaPadrao: false,
  dia: 7,
  ultimoDia: false,
  mes: 'seguinte' as const,
  consideraExame: true,
  exameDia: null,
  exameUltimoDia: true,
  exameMes: 'proprio' as const,
};

const exameMesCheio = { dia: 'ultimo', mes: 'proprio' };

describe('competência "YYYY-MM"', () => {
  it.each(['2026-01', '2026-12', '1999-07'])('aceita %s', (c) => {
    expect(() => exigirCompetencia(c)).not.toThrow();
  });

  it.each(['2026-00', '2026-13', '2026-1', '26-01', '2026-01-01', '2026/01', ''])(
    'recusa %j',
    (c) => {
      expect(() => exigirCompetencia(c)).toThrow(CompetenciaInvalidaError);
    },
  );

  it('mostra como MM/AAAA', () => {
    expect(mesAno('2026-10')).toBe('10/2026');
  });

  it('o mês acabou só depois da meia-noite do dia 1 seguinte em Brasília', () => {
    // 01/12/2026 02:59 UTC = 30/11 23:59 em Brasília.
    expect(mesAcabou('2026-11', new Date('2026-12-01T02:59:59Z'))).toBe(false);
    expect(mesAcabou('2026-11', new Date('2026-12-01T03:00:00Z'))).toBe(true);
    expect(mesAcabou('2026-10', new Date('2026-11-24T12:00:00Z'))).toBe(true);
    expect(mesAcabou('2026-12', new Date('2026-11-24T12:00:00Z'))).toBe(false);
  });
});

describe('corte da nova vigência', () => {
  it('corte com dia', () => {
    expect(corteDaEntrada(entrada)).toEqual({
      dia: 7,
      mes: 'seguinte',
      consideraExame: true,
      exame: exameMesCheio,
    });
  });

  it('corte no último dia', () => {
    expect(
      corteDaEntrada({
        ...entrada,
        dia: null,
        ultimoDia: true,
        mes: 'proprio',
        consideraExame: false,
      }),
    ).toEqual({ dia: 'ultimo', mes: 'proprio', consideraExame: false, exame: exameMesCheio });
  });

  it('corte do exame com dia', () => {
    expect(
      corteDaEntrada({ ...entrada, exameDia: 25, exameUltimoDia: false, exameMes: 'seguinte' }),
    ).toEqual({
      dia: 7,
      mes: 'seguinte',
      consideraExame: true,
      exame: { dia: 25, mes: 'seguinte' },
    });
  });

  it('"usa o padrão" do cliente não tem corte', () => {
    expect(
      corteDaEntrada({
        ...entrada,
        clienteId: 'c1',
        usaPadrao: true,
        dia: null,
        mes: null,
        consideraExame: null,
        exameUltimoDia: false,
        exameMes: null,
      }),
    ).toBeNull();
  });

  it('"usa o padrão" só com cliente', () => {
    expect(() => corteDaEntrada({ ...entrada, usaPadrao: true })).toThrow(
      'Só o corte de um cliente pode usar o padrão.',
    );
  });

  it.each([0, 32, 7.5, -1])('recusa o dia %d', (dia) => {
    expect(() => corteDaEntrada({ ...entrada, dia })).toThrow(VigenciaInvalidaError);
  });

  it('pede o dia ou o último dia, não os dois nem nenhum', () => {
    expect(() => corteDaEntrada({ ...entrada, ultimoDia: true })).toThrow(VigenciaInvalidaError);
    expect(() => corteDaEntrada({ ...entrada, dia: null })).toThrow(VigenciaInvalidaError);
  });

  it('pede o mês do corte e se considera a data do exame', () => {
    expect(() => corteDaEntrada({ ...entrada, mes: null })).toThrow(VigenciaInvalidaError);
    expect(() => corteDaEntrada({ ...entrada, consideraExame: null })).toThrow(
      VigenciaInvalidaError,
    );
  });
});

describe('corte do exame da nova vigência', () => {
  it.each([0, 32, 7.5])('recusa o dia %d', (exameDia) => {
    expect(() => corteDaEntrada({ ...entrada, exameDia, exameUltimoDia: false })).toThrow(
      'O dia do corte do exame tem de ser de 1 a 31.',
    );
  });

  it('pede o dia do exame ou o último dia, não os dois nem nenhum', () => {
    const mensagem = 'Informe o dia do corte do exame ou o último dia do mês.';
    expect(() => corteDaEntrada({ ...entrada, exameDia: 5 })).toThrow(mensagem);
    expect(() => corteDaEntrada({ ...entrada, exameUltimoDia: false })).toThrow(mensagem);
  });

  it('pede o mês do corte do exame', () => {
    expect(() => corteDaEntrada({ ...entrada, exameMes: null })).toThrow(
      'Informe o mês do corte do exame.',
    );
  });

  it('em campos, o corte traz o do exame; sem corte, tudo vazio', () => {
    expect(
      camposDoCorte({
        dia: 7,
        mes: 'seguinte',
        consideraExame: true,
        exame: { dia: 20, mes: 'proprio' },
      }),
    ).toMatchObject({ exameDia: 20, exameUltimoDia: false, exameMes: 'proprio' });
    expect(camposDoCorte({ dia: 7, mes: 'seguinte', consideraExame: false })).toMatchObject({
      exameDia: null,
      exameUltimoDia: true,
      exameMes: 'proprio',
    });
    expect(camposDoCorte(null)).toMatchObject({
      exameDia: null,
      exameUltimoDia: false,
      exameMes: null,
    });
  });
});

describe('início da vigência', () => {
  const mensagem = 'A vigência tem de começar depois da última competência fechada (10/2026).';

  it('sem competência fechada, vale qualquer mês', () => {
    expect(() => validarDesde('2000-01', null)).not.toThrow();
  });

  it('depois da última fechada, vale', () => {
    expect(() => validarDesde('2026-11', '2026-10')).not.toThrow();
  });

  it('na última fechada ou antes dela, recusa com o mês dela', () => {
    expect(() => validarDesde('2026-10', '2026-10')).toThrow(mensagem);
    expect(() => validarDesde('2026-09', '2026-10')).toThrow(mensagem);
  });
});
