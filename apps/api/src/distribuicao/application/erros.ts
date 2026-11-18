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

/** A especialidade ou modalidade das regras da frente (ou da prioridade do cliente) não existe. */
export class FrenteCatalogoNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Especialidade ou modalidade não encontrada.');
  }
}
