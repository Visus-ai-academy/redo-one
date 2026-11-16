import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class MedicoEscalaNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';

  constructor() {
    super('Médico não encontrado.');
  }
}
