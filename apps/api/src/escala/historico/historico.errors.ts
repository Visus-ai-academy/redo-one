import { ErroDeDominio } from '../../comum/erro-de-dominio';

export class PeriodoHistoricoInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';

  constructor() {
    super('A data inicial do período é depois da final. Ajuste o período.');
  }
}
