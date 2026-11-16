import { ErroDeDominio } from '../../comum/erro-de-dominio';

/** Também para a ausência fora do recorte da gestora: para ela, a ausência não existe. */
export class AusenciaNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';

  constructor() {
    super('Ausência não encontrada.');
  }
}

export class SemMedicoError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('Selecione ao menos um médico.');
  }
}

const CADASTROS = {
  medico: 'Médico não encontrado.',
  frente: 'Frente da escala não encontrada.',
  turno: 'Turno não encontrado.',
  tipo: 'Tipo de ausência não encontrado.',
} as const;

export class CadastroInexistenteError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor(oQue: keyof typeof CADASTROS) {
    super(`${CADASTROS[oQue]} Recarregue a página e escolha de novo.`);
  }
}

export class TipoAusenciaInativoError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('Este tipo de ausência está inativo. Escolha outro.');
  }
}

export class MedicoForaDoRecorteError extends ErroDeDominio {
  readonly tipo = 'proibido';

  constructor() {
    super(
      'Há médico sem alocação no seu recorte da escala nesse período. Tire-o da seleção ou peça a quem coordena a escala dele.',
    );
  }
}

export class FrenteForaDoRecorteError extends ErroDeDominio {
  readonly tipo = 'proibido';

  constructor() {
    super('Há frente fora do seu recorte da escala. Escolha só as frentes que você coordena.');
  }
}

export class ContaSemMedicoError extends ErroDeDominio {
  readonly tipo = 'proibido';

  constructor() {
    super('Sua conta não está ligada a um médico. Peça ao administrador para fazer o vínculo.');
  }
}
