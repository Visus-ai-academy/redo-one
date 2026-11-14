import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class RegraQuebraInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class RegraQuebraRepetidaError extends ErroDeDominio {
  readonly tipo = 'conflito';
}
