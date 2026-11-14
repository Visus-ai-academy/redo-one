import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class AliasMedicoInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

/** Uma grafia resolve um médico só: a mesma chave em dois médicos deixaria a importação sem saber qual. */
export class AliasMedicoEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';
}
