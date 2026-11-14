import { ErroDeDominio } from '../../comum/erro-de-dominio';
import type { Rotulo } from './rotulo';

export class ItemNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';

  constructor(rotulo: Rotulo) {
    super(`${rotulo.singular} não encontrad${rotulo.genero === 'f' ? 'a' : 'o'}.`);
  }
}

export class NomeEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor(rotulo: Rotulo, nome: string) {
    const um = rotulo.genero === 'f' ? 'uma' : 'um';
    super(
      `Já existe ${um} ${rotulo.singular.toLowerCase()} chamad${rotulo.genero === 'f' ? 'a' : 'o'} "${nome}".`,
    );
  }
}

/** O item é referenciado por outro cadastro: excluir deixaria o outro sem par. */
export class ItemEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor(rotulo: Rotulo) {
    const a = rotulo.genero === 'f' ? 'a' : 'o';
    super(
      `${a.toUpperCase()} ${rotulo.singular.toLowerCase()} está em uso. Desative-${a} em vez de excluir.`,
    );
  }
}

/** CNPJ, CPF, CEP ou UF fora do formato. */
export class DocumentoInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor(mensagem: string) {
    super(mensagem);
  }
}

/** Um cadastro ligado (modalidade, categoria...) foi excluído ou nunca existiu. */
export class ReferenciaInexistenteError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('Um dos cadastros escolhidos não existe mais. Recarregue a página e escolha de novo.');
  }
}
