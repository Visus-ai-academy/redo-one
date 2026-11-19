import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class ArquivoInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class ArquivoNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Arquivo não encontrado. Envie a planilha de novo.');
  }
}

export class ImportacaoNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Importação não encontrada.');
  }
}

export class AvisoNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Aviso não encontrado.');
  }
}

export class TriagemInvalidaError extends ErroDeDominio {
  readonly tipo = 'conflito';
}

export class ParametrosInvalidosError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class ImportacaoMobileMedIndisponivelError extends ErroDeDominio {
  readonly tipo = 'conflito';
}
