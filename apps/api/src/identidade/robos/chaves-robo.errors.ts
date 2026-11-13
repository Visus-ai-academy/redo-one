import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class ChaveRoboNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';

  constructor() {
    super('Chave de robô não encontrada.');
  }
}

export class PermissaoDeRoboInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor(readonly chaves: string[]) {
    super(`Permissões que não servem para robô: ${chaves.join(', ')}.`, { permissoes: chaves });
  }
}
