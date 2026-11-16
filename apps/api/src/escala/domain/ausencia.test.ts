import { describe, expect, it } from 'vitest';

import {
  type AusenciaEscala,
  aplicaNaOcorrencia,
  aprovarAusencia,
  cancelarSolicitacao,
  type DadosAusencia,
  recusarAusencia,
  validarAusencia,
} from './ausencia';
import {
  AcaoProibidaEscalaError,
  EscalaInvalidaError,
  RegistroEscalaNaoEncontradoError,
} from './errors';

const ferias = { soGestor: false };
const dispensado = { soGestor: true };

const pelaGestao: DadosAusencia = {
  dataInicio: '2026-11-09',
  dataFim: '2026-11-13',
  origem: 'gestor',
  tipo: ferias,
};

describe('validarAusencia', () => {
  it('lançada pelo gestor já nasce aprovada; recortes vazios = todos', () => {
    expect(validarAusencia(pelaGestao)).toEqual({
      dataInicio: '2026-11-09',
      dataFim: '2026-11-13',
      diasSemana: [],
      frenteIds: [],
      turnoIds: [],
      situacao: 'aprovada',
    });
  });

  it('pedida pelo médico nasce pendente e exige o motivo', () => {
    const pedido: DadosAusencia = { ...pelaGestao, origem: 'medico', observacoes: 'Congresso' };
    expect(validarAusencia(pedido).situacao).toBe('pendente');
    expect(() => validarAusencia({ ...pedido, observacoes: '  ' })).toThrow(
      'Descreva o motivo da ausência.',
    );
  });

  it('o médico não pede um tipo que só o gestor lança', () => {
    expect(() =>
      validarAusencia({ ...pelaGestao, origem: 'medico', tipo: dispensado, observacoes: 'xyz' }),
    ).toThrow(AcaoProibidaEscalaError);
    expect(validarAusencia({ ...pelaGestao, tipo: dispensado }).situacao).toBe('aprovada');
  });

  it('recusa fim antes do início', () => {
    expect(() => validarAusencia({ ...pelaGestao, dataFim: '2026-11-08' })).toThrow(
      EscalaInvalidaError,
    );
  });

  it('normaliza os recortes', () => {
    const v = validarAusencia({
      ...pelaGestao,
      diasSemana: [3, 1, 3],
      frenteIds: ['f1', 'f1'],
      turnoIds: ['t2', 't1'],
    });
    expect(v).toMatchObject({ diasSemana: [1, 3], frenteIds: ['f1'], turnoIds: ['t2', 't1'] });
  });

  it('pelo menos um dia da semana marcado cai no período', () => {
    // 09 a 13/11/2026 é segunda a sexta
    expect(() => validarAusencia({ ...pelaGestao, diasSemana: [0, 6] })).toThrow(
      'Nenhum dos dias da semana escolhidos cai no período.',
    );
  });
});

describe('aplicaNaOcorrencia', () => {
  const ausencia: AusenciaEscala = {
    id: 'a1',
    medicoId: 'm1',
    tipoId: 'ferias',
    dataInicio: '2026-11-09',
    dataFim: '2026-11-13',
    diasSemana: [],
    frenteIds: [],
    turnoIds: [],
    situacao: 'aprovada',
  };
  const ocorrencia = { medicoId: 'm1', data: '2026-11-10', frenteId: 'f1', turnoId: 't1' };

  it('aprovada, do médico e no período: aplica no dia inteiro e em toda frente', () => {
    expect(aplicaNaOcorrencia(ausencia, ocorrencia)).toBe(true);
  });

  it('só a aprovada conta', () => {
    expect(aplicaNaOcorrencia({ ...ausencia, situacao: 'pendente' }, ocorrencia)).toBe(false);
    expect(aplicaNaOcorrencia({ ...ausencia, situacao: 'recusada' }, ocorrencia)).toBe(false);
  });

  it('outro médico ou fora do período não aplica', () => {
    expect(aplicaNaOcorrencia(ausencia, { ...ocorrencia, medicoId: 'm2' })).toBe(false);
    expect(aplicaNaOcorrencia(ausencia, { ...ocorrencia, data: '2026-11-14' })).toBe(false);
    expect(aplicaNaOcorrencia(ausencia, { ...ocorrencia, data: '2026-11-08' })).toBe(false);
  });

  it('respeita os recortes de dias da semana, frentes e turnos', () => {
    expect(aplicaNaOcorrencia({ ...ausencia, diasSemana: [3] }, ocorrencia)).toBe(false);
    expect(aplicaNaOcorrencia({ ...ausencia, diasSemana: [2] }, ocorrencia)).toBe(true);
    expect(aplicaNaOcorrencia({ ...ausencia, frenteIds: ['f2'] }, ocorrencia)).toBe(false);
    expect(aplicaNaOcorrencia({ ...ausencia, frenteIds: ['f1'] }, ocorrencia)).toBe(true);
    expect(aplicaNaOcorrencia({ ...ausencia, turnoIds: ['t2'] }, ocorrencia)).toBe(false);
    expect(aplicaNaOcorrencia({ ...ausencia, turnoIds: ['t1'] }, ocorrencia)).toBe(true);
  });
});

describe('revisão da solicitação', () => {
  const revisao = { usuarioId: 'gestor-1', em: new Date('2026-11-16T12:00:00Z') };

  it('aprova a pendente', () => {
    expect(aprovarAusencia({ situacao: 'pendente' }, revisao)).toEqual({
      situacao: 'aprovada',
      motivoRecusa: null,
      revisadaPorId: 'gestor-1',
      revisadaEm: revisao.em,
    });
  });

  it('recusa a pendente com motivo', () => {
    expect(recusarAusencia({ situacao: 'pendente' }, '  Escala cheia ', revisao)).toEqual({
      situacao: 'recusada',
      motivoRecusa: 'Escala cheia',
      revisadaPorId: 'gestor-1',
      revisadaEm: revisao.em,
    });
  });

  it('recusa exige motivo', () => {
    expect(() => recusarAusencia({ situacao: 'pendente' }, ' ', revisao)).toThrow(
      'Informe o motivo da recusa.',
    );
  });

  it.each(['aprovada', 'recusada'] as const)('não revisa de novo uma %s', (situacao) => {
    expect(() => aprovarAusencia({ situacao }, revisao)).toThrow(EscalaInvalidaError);
    expect(() => recusarAusencia({ situacao }, 'motivo', revisao)).toThrow(EscalaInvalidaError);
  });
});

describe('cancelarSolicitacao', () => {
  const pedido = { situacao: 'pendente' as const, origem: 'medico' as const, medicoId: 'm1' };

  it('o médico cancela o próprio pedido pendente', () => {
    expect(() => cancelarSolicitacao(pedido, 'm1')).not.toThrow();
  });

  it('não acha o pedido de outro médico', () => {
    expect(() => cancelarSolicitacao(pedido, 'm2')).toThrow(RegistroEscalaNaoEncontradoError);
  });

  it('só cancela enquanto pendente', () => {
    expect(() => cancelarSolicitacao({ ...pedido, situacao: 'aprovada' }, 'm1')).toThrow(
      'Só dá para cancelar uma solicitação pendente.',
    );
  });

  it('não cancela ausência lançada pelo gestor', () => {
    expect(() => cancelarSolicitacao({ ...pedido, origem: 'gestor' }, 'm1')).toThrow(
      AcaoProibidaEscalaError,
    );
  });
});
