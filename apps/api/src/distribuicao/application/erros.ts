import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class MedicoNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Médico não encontrado.');
  }
}

export class EquipeNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Equipe não encontrada.');
  }
}

export class FrenteNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Frente da escala não encontrada.');
  }
}

export class ArranjosInvalidosError extends ErroDeDominio {
  readonly tipo = 'invalido';
}
