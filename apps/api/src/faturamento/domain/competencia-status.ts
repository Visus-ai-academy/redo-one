import { ErroDeDominio } from '../../comum/erro-de-dominio';

/** Fechada = os laudos dela não mudam mais (a importação e o recálculo a ignoram). */
export type StatusCompetencia = 'aberta' | 'fechada';

export class CompetenciaJaFechadaError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super('A competência já está fechada.');
  }
}

export class CompetenciaJaAbertaError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super('A competência já está aberta.');
  }
}

/** Só se fecha a competência aberta. */
export function fechar(status: StatusCompetencia): StatusCompetencia {
  if (status === 'fechada') throw new CompetenciaJaFechadaError();
  return 'fechada';
}

/** Só se reabre a fechada. Reabrir não mexe na trava separada da importação. */
export function reabrir(status: StatusCompetencia): StatusCompetencia {
  if (status === 'aberta') throw new CompetenciaJaAbertaError();
  return 'aberta';
}
