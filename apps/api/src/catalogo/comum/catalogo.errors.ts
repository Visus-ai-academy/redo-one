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
