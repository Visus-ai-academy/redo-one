import { ErroDeDominio } from '../../comum/erro-de-dominio';

/** Link desconhecido, vencido, já usado, substituído ou de conta desativada: tudo dá no mesmo. */
export class LinkSenhaInvalidoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';

  constructor() {
    super('Este link não vale mais. Peça um link novo.');
  }
}

export class SenhaFracaError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor(readonly problemas: string[]) {
    super(`A senha não serve: ${problemas.join(' ')}`, { problemas });
  }
}
