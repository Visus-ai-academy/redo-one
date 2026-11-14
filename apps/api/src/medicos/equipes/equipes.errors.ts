import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class MedicoInexistenteError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('Um dos médicos escolhidos não existe mais. Recarregue a página e escolha de novo.');
  }
}
