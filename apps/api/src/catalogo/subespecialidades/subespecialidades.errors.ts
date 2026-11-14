import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class SubespecialidadeSemEspecialidadeError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('Escolha ao menos uma especialidade.');
  }
}

export class EspecialidadeInexistenteError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('Especialidade não encontrada.');
  }
}
