import { ErroDeDominio } from '../../comum/erro-de-dominio';

/** Configuração do robô fora da regra (global, da frente, do cliente ou do ajuste do dia). */
export class ConfiguracaoInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export const invalida = (mensagem: string): never => {
  throw new ConfiguracaoInvalidaError(mensagem);
};

export function semRepetidos(lista: readonly string[], mensagem: string): void {
  if (new Set(lista).size !== lista.length) invalida(mensagem);
}

/** Inteiro dentro da faixa [min, max]. */
export function inteiroEntre(valor: number, min: number, max: number, rotulo: string): void {
  if (!Number.isInteger(valor) || valor < min || valor > max) {
    invalida(`${rotulo}: use um número inteiro de ${min} a ${max}.`);
  }
}

const HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "HH:MM" de 00:00 a 23:59 (relógio de Brasília). */
export function validarHorario(valor: string, rotulo: string): void {
  if (!HORARIO.test(valor)) invalida(`${rotulo}: use HH:MM, de 00:00 a 23:59.`);
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" que existe no calendário. */
export function validarData(valor: string, rotulo = 'Data'): void {
  const d = new Date(`${valor}T00:00:00Z`);
  if (!DATA.test(valor) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor) {
    invalida(`${rotulo} inválida: use AAAA-MM-DD.`);
  }
}
