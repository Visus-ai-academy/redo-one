import { ErroDeDominio } from '../../comum/erro-de-dominio';

/** A gestora não amplia o próprio recorte: quem define é outra pessoa com a permissão. */
export class EscopoDoProprioUsuarioError extends ErroDeDominio {
  readonly tipo = 'proibido';

  constructor() {
    super('Você não pode editar o seu próprio recorte da escala. Peça a outro gestor.');
  }
}

/** Vazio nunca é "toda a escala": ou "vê toda a escala", ou ao menos um turno ou frente. */
export class RecorteEscalaInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class UsuarioInexistenteError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';

  constructor() {
    super('Usuário não encontrado.');
  }
}

export class TurnoInexistenteError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('Turno não encontrado. Recarregue a página e escolha de novo.');
  }
}

export class FrenteInexistenteError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('Frente da escala não encontrada. Recarregue a página e escolha de novo.');
  }
}
