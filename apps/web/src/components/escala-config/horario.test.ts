import { describe, expect, it } from 'vitest';

import { formatarDuracao, formatarHorario, horarioValido, normalizarHorario } from './horario';

describe('horario', () => {
  it('aceita HH:MM e H:MM, recusa o resto', () => {
    expect(horarioValido('07:00')).toBe(true);
    expect(horarioValido('7:00')).toBe(true);
    expect(horarioValido('23:59')).toBe(true);
    expect(horarioValido('24:00')).toBe(false);
    expect(horarioValido('7h')).toBe(false);
    expect(horarioValido('07:60')).toBe(false);
    expect(horarioValido('')).toBe(false);
  });

  it('normaliza para dois dígitos na hora', () => {
    expect(normalizarHorario(' 7:05 ')).toBe('07:05');
    expect(normalizarHorario('19:00')).toBe('19:00');
  });

  it('mostra o horário com travessão', () => {
    expect(formatarHorario('07:00', '13:00')).toBe('07:00–13:00');
  });

  it('mostra a duração em horas e minutos', () => {
    expect(formatarDuracao(360)).toBe('6 h');
    expect(formatarDuracao(390)).toBe('6 h 30 min');
    expect(formatarDuracao(45)).toBe('45 min');
    expect(formatarDuracao(1440)).toBe('24 h');
  });
});
