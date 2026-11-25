import { ErroDeDominio } from '../../comum/erro-de-dominio';

export { DocumentoInvalidoError } from '../comum/catalogo.errors';

export class CnpjEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor() {
    super('Já existe um contratado com esse CNPJ.');
  }
}

export class RepasseInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

/** A consolidação do repasse é de um passo só: o motor não segue cadeias. */
export class RepasseEmCadeiaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

/** O padrão vem escolhido nos campos de contratado: precisa estar na lista dos ativos. */
export class PadraoInativoError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('Um contratado inativo não pode ser o contratado padrão.');
  }
}

/** O financeiro do One emite nota e cobra em nome do contratado: só para quem está ativo. */
export class FinanceiroInativoError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('Um contratado inativo não pode usar o financeiro do One.');
  }
}
