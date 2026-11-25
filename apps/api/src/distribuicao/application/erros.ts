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

export class ClienteNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Cliente não encontrado.');
  }
}

export class AlocacaoNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Alocação não encontrada.');
  }
}

export class PrioridadeOperacaoNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Prioridade da operação não encontrada.');
  }
}

/** Marcada em alocações da escala ou em arranjos: excluir alargaria esses recortes calado. */
export class PrioridadeOperacaoEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super(
      'A prioridade está marcada em alocações da escala ou em arranjos. Desmarque-a lá antes de excluir.',
    );
  }
}

export class ExcecaoRecebimentoNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Exceção da grade de recebimento não encontrada.');
  }
}
