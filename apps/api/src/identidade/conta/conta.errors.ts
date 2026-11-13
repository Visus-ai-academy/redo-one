import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class SenhaAtualIncorretaError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('A senha atual não confere. Digite de novo ou use "Esqueci minha senha" no login.');
  }
}
