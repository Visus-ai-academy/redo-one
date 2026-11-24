import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class OutraContaInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

/** Uma conta da MobileMed é de um médico só: a importação e o robô reconhecem o médico por ela. */
export class OutraContaEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';
}
