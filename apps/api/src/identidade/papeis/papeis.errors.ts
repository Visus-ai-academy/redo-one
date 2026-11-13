import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class PapelNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';

  constructor() {
    super('Papel não encontrado.');
  }
}

export class NomeDePapelEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor(nome: string) {
    super(`Já existe um papel chamado "${nome}".`);
  }
}

export class PermissaoInexistenteError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor(readonly chaves: string[]) {
    super(`Permissões que não existem: ${chaves.join(', ')}.`, { permissoes: chaves });
  }
}

/** Quem não é Administrador só concede permissões que ele mesmo tem. */
export class PermissaoNaoConcedivelError extends ErroDeDominio {
  readonly tipo = 'proibido';

  constructor(readonly chaves: string[]) {
    super(`Você não pode conceder permissões que não tem: ${chaves.join(', ')}.`, {
      permissoes: chaves,
    });
  }
}

export class PapelDoSistemaError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor() {
    super('Papel do sistema não pode ser editado nem excluído. Use Duplicar.');
  }
}

export class PapelEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor(readonly totalUsuarios: number) {
    super(
      `O papel tem ${totalUsuarios} ${totalUsuarios === 1 ? 'usuário' : 'usuários'}. ` +
        'Troque o papel deles antes de excluir.',
      { totalUsuarios },
    );
  }
}
