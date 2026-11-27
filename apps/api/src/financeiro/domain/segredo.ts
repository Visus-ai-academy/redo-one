const PROTEGIDO = '[protegido]';

/**
 * Credencial devolvida por um sistema externo (ex.: o token de uma empresa na Focus NFe). Nunca
 * aparece em log, JSON ou mensagem de erro: só `revelar()` devolve o valor, para quem vai usá-lo
 * numa chamada. Não é para guardar no banco (credenciais de saída ficam só no ambiente).
 */
export class Segredo {
  readonly #valor: string;

  constructor(valor: string) {
    this.#valor = valor;
  }

  revelar(): string {
    return this.#valor;
  }

  toString(): string {
    return PROTEGIDO;
  }

  toJSON(): string {
    return PROTEGIDO;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `Segredo(${PROTEGIDO})`;
  }
}
