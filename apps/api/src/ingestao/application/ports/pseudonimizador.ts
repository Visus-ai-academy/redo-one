export const PSEUDONIMIZADOR = Symbol('PSEUDONIMIZADOR');

/** HMAC com segredo próprio: o mesmo paciente vira sempre o mesmo pseudônimo. */
export interface Pseudonimizador {
  pseudonimo(texto: string): string;
}
