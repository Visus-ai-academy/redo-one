import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class DeParaInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class DeParaRepetidoError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor(origem: string) {
    super(`Já existe um de-para para "${origem}".`);
  }
}
