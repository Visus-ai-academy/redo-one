import { EscalaInvalidaError } from './errors';

/** Horário de Brasília em "HH:MM" (00:00 a 23:59). */
export type Horario = string;

/** Faixa de horário: a do turno (a caixa) ou a do vínculo do médico. */
export interface FaixaHorario {
  horarioInicio: Horario;
  horarioFim: Horario;
}

export const MINUTOS_NO_DIA = 1440;

/**
 * Aceita "H:MM" ou "HH:MM" e devolve "HH:MM". O dashboards-one (`hhmm`) aceitava lixo depois dos
 * minutos ("07:00:00", "07:00x"); aqui o formato é exato.
 */
export function normalizarHorario(valor: string): Horario {
  const texto = valor.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto);
  const hora = Number(m?.[1]);
  const minuto = Number(m?.[2]);
  if (!m || hora > 23 || minuto > 59) {
    throw new EscalaInvalidaError(`Horário inválido: "${texto}". Use HH:MM, de 00:00 a 23:59.`);
  }
  return `${String(hora).padStart(2, '0')}:${m[2]}`;
}

export function minutosDoDia(horario: Horario): number {
  const [h = 0, m = 0] = horario.split(':').map(Number);
  return h * 60 + m;
}

/** Duração em minutos (1 a 1440). Fim antes do início vira a meia-noite; fim = início é 24 h. */
export function duracaoMinutos(inicio: Horario, fim: Horario): number {
  return (
    (minutosDoDia(fim) - minutosDoDia(inicio) + MINUTOS_NO_DIA) % MINUTOS_NO_DIA || MINUTOS_NO_DIA
  );
}

/**
 * O horário do médico cabe na caixa do turno? Medido pela duração a partir do início do turno
 * (não por comparação de relógio), para valer nas faixas que viram a meia-noite. Turno de 24 h
 * aceita qualquer faixa, inclusive outra de 24 h começando em outra hora.
 * Fonte: dashboards-one `escala-hierarquica.ts` `cabeNoTurno` (:77-85).
 */
export function cabeNoTurno(turno: FaixaHorario, faixa: FaixaHorario): boolean {
  const duracaoTurno = duracaoMinutos(turno.horarioInicio, turno.horarioFim);
  if (duracaoTurno >= MINUTOS_NO_DIA) return true;
  const deslocamento =
    (minutosDoDia(faixa.horarioInicio) - minutosDoDia(turno.horarioInicio) + MINUTOS_NO_DIA) %
    MINUTOS_NO_DIA;
  return deslocamento + duracaoMinutos(faixa.horarioInicio, faixa.horarioFim) <= duracaoTurno;
}
