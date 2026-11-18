import { describe, expect, it } from 'vitest';

import {
  aplicarNasCelulas,
  celulasParaApi,
  chaveCelula,
  errosDaGrade,
  gradeDasCelulas,
  regraEfetiva,
  rotuloCurto,
  rotuloRecebimento,
  rotuloUrgencia,
  urgenciaParaApi,
  urgenciasDaFrente,
  urgenciasParaApi,
  valorUrgencia,
} from './recebimento';

const celula = (
  prioridadeOperacaoId: string,
  turnoId: string,
  tipo: 'segue_sla' | 'prazo_minimo' | 'nao_recebe',
  horas: number | null = null,
) => ({ prioridadeOperacaoId, turnoId, regra: { tipo, horas } });

describe('rótulos para quem opera', () => {
  it('recebimento: por extenso e curto (na célula da grade)', () => {
    expect(rotuloRecebimento({ tipo: 'segue_sla', horas: null })).toBe('Segue o SLA');
    expect(rotuloRecebimento({ tipo: 'prazo_minimo', horas: 24 })).toBe(
      'Só com 24 h ou mais até o prazo',
    );
    expect(rotuloRecebimento({ tipo: 'nao_recebe', horas: null })).toBe('Não recebe');
    expect(rotuloCurto({ tipo: 'prazo_minimo', horas: 48 })).toBe('≥ 48 h');
    expect(rotuloCurto({ tipo: 'segue_sla', horas: null })).toBe('SLA');
  });

  it('urgência', () => {
    expect(rotuloUrgencia({ tipo: 'nunca', horas: null })).toBe('Nunca');
    expect(rotuloUrgencia({ tipo: 'sempre', horas: null })).toBe('Sempre');
    expect(rotuloUrgencia({ tipo: 'prazo', horas: 24 })).toBe('Com menos de 24 h até o prazo');
  });
});

describe('grade de recebimento no formulário', () => {
  it('célula ausente na geral segue o SLA; na frente, vale a geral', () => {
    const grade = gradeDasCelulas([celula('rot', 'lista', 'prazo_minimo', 24)]);
    expect(grade[chaveCelula('rot', 'lista')]).toEqual({ tipo: 'prazo_minimo', horas: '24' });
    expect(regraEfetiva(grade, 'rot', 'manha')).toEqual({ tipo: 'segue_sla', horas: null });
    const frente = { [chaveCelula('rot', 'manha')]: { tipo: 'geral' as const, horas: '' } };
    expect(regraEfetiva(frente, 'rot', 'manha', grade)).toEqual({ tipo: 'segue_sla', horas: null });
    expect(regraEfetiva(frente, 'rot', 'lista', grade)).toEqual({
      tipo: 'prazo_minimo',
      horas: 24,
    });
  });

  it('para a API: a geral não grava "segue o SLA" (é o vazio); a frente não grava "geral"', () => {
    const grade = {
      [chaveCelula('rot', 'lista')]: { tipo: 'prazo_minimo' as const, horas: '24' },
      [chaveCelula('rot', 'manha')]: { tipo: 'segue_sla' as const, horas: '' },
      [chaveCelula('urg', 'lista')]: { tipo: 'geral' as const, horas: '' },
    };
    expect(celulasParaApi(grade, { omitirSla: true })).toEqual([
      celula('rot', 'lista', 'prazo_minimo', 24),
    ]);
    expect(celulasParaApi(grade, { omitirSla: false })).toEqual([
      celula('rot', 'lista', 'prazo_minimo', 24),
      celula('rot', 'manha', 'segue_sla'),
    ]);
  });

  it('aplica a mesma regra a uma linha ou coluna inteira, sem mexer no resto', () => {
    const grade = {
      [chaveCelula('rot', 'lista')]: { tipo: 'prazo_minimo' as const, horas: '24' },
      [chaveCelula('urg', 'lista')]: { tipo: 'nao_recebe' as const, horas: '' },
    };
    const naoRecebe = { tipo: 'nao_recebe' as const, horas: '' };
    expect(aplicarNasCelulas(grade, ['rot'], ['manha', 'lista'], naoRecebe)).toEqual({
      [chaveCelula('rot', 'manha')]: naoRecebe,
      [chaveCelula('rot', 'lista')]: naoRecebe,
      [chaveCelula('urg', 'lista')]: naoRecebe,
    });
    const prazo = { tipo: 'prazo_minimo' as const, horas: '12' };
    expect(aplicarNasCelulas(grade, ['rot', 'urg'], ['lista'], prazo)).toEqual({
      [chaveCelula('rot', 'lista')]: prazo,
      [chaveCelula('urg', 'lista')]: prazo,
    });
  });

  it('para a API, só as células das prioridades que ainda existem', () => {
    const grade = {
      [chaveCelula('rot', 'lista')]: { tipo: 'prazo_minimo' as const, horas: '24' },
      [chaveCelula('excluida', 'lista')]: { tipo: 'nao_recebe' as const, horas: '' },
    };
    expect(celulasParaApi(grade, { omitirSla: true, prioridadeIds: ['rot'] })).toEqual([
      celula('rot', 'lista', 'prazo_minimo', 24),
    ]);
  });

  it('prazo mínimo precisa de horas inteiras de 1 a 720', () => {
    const grade = {
      [chaveCelula('rot', 'lista')]: { tipo: 'prazo_minimo' as const, horas: '' },
      [chaveCelula('amb', 'lista')]: { tipo: 'prazo_minimo' as const, horas: '0' },
      [chaveCelula('int', 'lista')]: { tipo: 'prazo_minimo' as const, horas: '24' },
    };
    expect(errosDaGrade(grade)).toEqual({
      [chaveCelula('rot', 'lista')]: 'Informe as horas (1 a 720).',
      [chaveCelula('amb', 'lista')]: 'Informe as horas (1 a 720).',
    });
  });
});

describe('urgência na frente', () => {
  it('vai e volta: ausente = como na geral', () => {
    const v = urgenciasDaFrente(
      [{ prioridadeOperacaoId: 'amb', urgencia: { tipo: 'nunca', horas: null } }],
      ['urg', 'amb'],
    );
    expect(v).toEqual({
      urg: { tipo: 'geral', horas: '' },
      amb: { tipo: 'nunca', horas: '' },
    });
    expect(urgenciasParaApi({ ...v, urg: { tipo: 'prazo', horas: '6' } })).toEqual([
      { prioridadeOperacaoId: 'urg', urgencia: { tipo: 'prazo', horas: 6 } },
      { prioridadeOperacaoId: 'amb', urgencia: { tipo: 'nunca', horas: null } },
    ]);
  });

  it('a regra da prioridade no formulário', () => {
    expect(valorUrgencia({ tipo: 'prazo', horas: 24 })).toEqual({ tipo: 'prazo', horas: '24' });
    expect(urgenciaParaApi({ tipo: 'sempre', horas: '9' })).toEqual({
      tipo: 'sempre',
      horas: null,
    });
  });
});
