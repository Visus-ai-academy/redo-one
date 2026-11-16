import { describe, expect, it } from 'vitest';

import { EscalaInvalidaError } from './errors';
import { cabeNoTurno, duracaoMinutos, minutosDoDia, normalizarHorario } from './horario';

describe('normalizarHorario', () => {
  it('completa a hora com zero à esquerda', () => {
    expect(normalizarHorario('7:00')).toBe('07:00');
  });

  it('mantém "HH:MM" e ignora espaços nas pontas', () => {
    expect(normalizarHorario(' 19:30 ')).toBe('19:30');
  });

  it.each(['24:00', '12:60', '7', '07:0', 'aa:bb', '', '07:00:00', '07:00x'])(
    'recusa "%s"',
    (valor) => {
      expect(() => normalizarHorario(valor)).toThrow(EscalaInvalidaError);
    },
  );
});

describe('minutosDoDia', () => {
  it('conta os minutos desde a meia-noite', () => {
    expect(minutosDoDia('00:00')).toBe(0);
    expect(minutosDoDia('13:45')).toBe(825);
  });
});

describe('duracaoMinutos', () => {
  it('mede a faixa no mesmo dia', () => {
    expect(duracaoMinutos('07:00', '13:00')).toBe(360);
  });

  it('vira a meia-noite quando o fim é antes do início', () => {
    expect(duracaoMinutos('19:00', '07:00')).toBe(720);
  });

  it('fim igual ao início é 24 h', () => {
    expect(duracaoMinutos('07:00', '07:00')).toBe(1440);
  });
});

describe('cabeNoTurno', () => {
  const manha = { horarioInicio: '07:00', horarioFim: '13:00' };
  const noite = { horarioInicio: '19:00', horarioFim: '07:00' };
  const lista = { horarioInicio: '07:00', horarioFim: '07:00' };

  it('aceita o turno inteiro', () => {
    expect(cabeNoTurno(manha, manha)).toBe(true);
  });

  it('aceita um pedaço do turno', () => {
    expect(cabeNoTurno(manha, { horarioInicio: '09:00', horarioFim: '13:00' })).toBe(true);
  });

  it('recusa faixa que começa antes do turno', () => {
    expect(cabeNoTurno(manha, { horarioInicio: '06:00', horarioFim: '12:00' })).toBe(false);
  });

  it('recusa faixa que termina depois do turno', () => {
    expect(cabeNoTurno(manha, { horarioInicio: '08:00', horarioFim: '14:00' })).toBe(false);
  });

  it('mede pela duração no turno que vira a meia-noite', () => {
    expect(cabeNoTurno(noite, { horarioInicio: '23:00', horarioFim: '05:00' })).toBe(true);
    expect(cabeNoTurno(noite, { horarioInicio: '01:00', horarioFim: '07:00' })).toBe(true);
    expect(cabeNoTurno(noite, { horarioInicio: '01:00', horarioFim: '08:00' })).toBe(false);
    expect(cabeNoTurno(noite, { horarioInicio: '18:00', horarioFim: '23:00' })).toBe(false);
  });

  it('recusa faixa de 24 h num turno menor', () => {
    expect(cabeNoTurno(noite, { horarioInicio: '19:00', horarioFim: '19:00' })).toBe(false);
  });

  it('turno de 24 h aceita qualquer faixa, inclusive outra de 24 h em outro horário', () => {
    expect(cabeNoTurno(lista, { horarioInicio: '13:00', horarioFim: '13:00' })).toBe(true);
    expect(cabeNoTurno(lista, { horarioInicio: '03:00', horarioFim: '09:00' })).toBe(true);
  });
});
