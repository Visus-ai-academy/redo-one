import { ErroDeDominio } from '../../comum/erro-de-dominio';

/** A empresa que fatura decide o demonstrativo e quem emite a nota: sem ela, não há cliente. */
export class ContratadoObrigatorioError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class AliasInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class AliasEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';
}
