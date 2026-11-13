/** Mesma resposta para e-mail/CPF inexistente, senha errada, conta desativada ou convite pendente. */
export class CredenciaisInvalidasError extends Error {
  constructor() {
    super('E-mail, CPF ou senha incorretos.');
    this.name = 'CredenciaisInvalidasError';
  }
}

/** Conta ou IP bloqueado por excesso de tentativas; `ate` diz quando volta a aceitar login. */
export class AcessoBloqueadoError extends Error {
  constructor(readonly ate: Date) {
    super('Acesso bloqueado por excesso de tentativas.');
    this.name = 'AcessoBloqueadoError';
  }
}
