import { ErroDeDominio } from '../../comum/erro-de-dominio';

/** Sem letras depois de normalizar (ex.: "Dr. 123"): a importação não teria com o que comparar. */
export class NomeMedicoInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('Informe o nome do médico com letras.');
  }
}

/** O robô escolhe a conta pelo id: dois médicos com o mesmo id recebem os exames um do outro. */
export class IdMobilemedEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor(nomeDoOutro: string) {
    super(`Esse ID da MobileMed já está no cadastro de ${nomeDoOutro}.`);
  }
}

/** A conta não pode ser a principal e uma das outras contas do mesmo médico ao mesmo tempo. */
export class IdMobilemedEmOutrasContasError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor() {
    super(
      'Esse ID está em Outras contas deste médico. Remova-o de lá antes de torná-lo a conta principal.',
    );
  }
}

export class NivelInexistenteError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('Nível não encontrado. Recarregue a página e escolha de novo.');
  }
}
