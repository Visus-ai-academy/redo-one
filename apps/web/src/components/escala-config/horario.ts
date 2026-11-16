const HORARIO = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM" de Brasília; a API também aceita a hora com um dígito ("7:00"). */
export function horarioValido(texto: string) {
  return HORARIO.test(texto.trim());
}

/** "7:05" vira "07:05", para a lista ficar alinhada. */
export function normalizarHorario(texto: string) {
  const limpo = texto.trim();
  return limpo.length === 4 ? `0${limpo}` : limpo;
}

/** "07:00–13:00". */
export function formatarHorario(inicio: string, fim: string) {
  return `${inicio}–${fim}`;
}

/** 390 → "6 h 30 min". */
export function formatarDuracao(minutos: number) {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}
