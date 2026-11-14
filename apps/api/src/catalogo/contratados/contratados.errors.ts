import { ErroDeDominio } from '../../comum/erro-de-dominio';

export { DocumentoInvalidoError } from '../comum/catalogo.errors';

export class CnpjEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor() {
    super('Já existe um contratado com esse CNPJ.');
  }
}

export class RepasseInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

/** A consolidação do repasse é de um passo só: o motor não segue cadeias. */
export class RepasseEmCadeiaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}
