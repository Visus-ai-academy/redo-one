import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class UsuarioNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';

  constructor() {
    super('Usuário não encontrado.');
  }
}

export class EmailEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor() {
    super('Já existe uma conta com este e-mail.');
  }
}

export class CpfEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor() {
    super('Já existe uma conta com este CPF.');
  }
}

export class CpfInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('O CPF precisa ter 11 dígitos.');
  }
}

/** Só se atribui papel cujas permissões quem atribui também tem (Administrador, só outro Administrador). */
export class PapelNaoAtribuivelError extends ErroDeDominio {
  readonly tipo = 'proibido';

  constructor() {
    super('Você não pode dar a alguém um papel com permissões que você não tem.');
  }
}

export class AcaoSobreSiMesmoError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor() {
    super('Você não pode trocar o próprio papel nem desativar a própria conta.');
  }
}

export class ConviteJaAceitoError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor() {
    super('Esta pessoa já criou a senha. Para trocar, envie um link de nova senha.');
  }
}

export class ConvitePendenteError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor() {
    super('Esta pessoa ainda não aceitou o convite. Reenvie o convite.');
  }
}

export class SessaoNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';

  constructor() {
    super('Sessão não encontrada para este usuário.');
  }
}

export class MedicoNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';

  constructor() {
    super('Médico não encontrado.');
  }
}

/** Um médico, uma conta: o portal mostra os dados de um médico só para quem é ele. */
export class MedicoJaTemAcessoError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor(nomeDaConta: string) {
    super(`Este médico já tem acesso pela conta de ${nomeDaConta}.`);
  }
}

export class SemPapelError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('Escolha pelo menos um papel.');
  }
}
