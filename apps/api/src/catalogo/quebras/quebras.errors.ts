import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class QuebraInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class QuebraRepetidaError extends ErroDeDominio {
  readonly tipo = 'conflito';
}
