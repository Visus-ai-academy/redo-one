import { ErroDeDominio } from '../../../../comum/erro-de-dominio';

export class RodadaNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Rodada não encontrada.');
  }
}

/** Dois robôs lendo a mesma fila dariam o mesmo exame duas vezes: uma rodada viva por vez. */
export class RodadaVivaError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor(status?: string) {
    super(
      `Já existe uma rodada em andamento${status ? ` (${status})` : ''}: acompanhe-a, encerre-a ou cancele-a antes de iniciar outra.`,
    );
  }
}

export class RodadaRecusadaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}
