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

export class ImportacaoJaTravadaError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super('A importação desta competência já está travada.');
  }
}

export class ImportacaoNaoTravadaError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super('A importação desta competência não está travada.');
  }
}

export class CompetenciaNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Competência não encontrada. Ela passa a existir quando chega o primeiro laudo do mês.');
  }
}

export class CompetenciaEmAndamentoError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super('A competência só pode ser fechada depois que o mês dela acabar.');
  }
}

/** Fechar com avisos pendentes que impedem: a tela lista os avisos e, com a permissão, pede o motivo. */
export class CompetenciaComAvisosError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor(
    avisos: { total: number; itens: { id: string; tipo: string; valor: string }[] },
    podeFecharComAvisos: boolean,
  ) {
    super(
      `${avisos.total === 1 ? 'Há 1 aviso pendente que impede' : `Há ${avisos.total} avisos pendentes que impedem`} fechar a competência. Resolva ${avisos.total === 1 ? 'o aviso' : 'os avisos'} em Operação › Avisos${podeFecharComAvisos ? ' ou feche mesmo assim informando o motivo' : ''}.`,
      { codigo: 'avisos_pendentes', avisos, podeFecharComAvisos },
    );
  }
}

export class FecharComAvisosProibidoError extends ErroDeDominio {
  readonly tipo = 'proibido';
  constructor() {
    super('Você não tem permissão para fechar a competência com avisos pendentes.');
  }
}

/** Trava a importação da competência (mesmo aberta); recusa a já travada. */
export function travar(travada: boolean): void {
  if (travada) throw new ImportacaoJaTravadaError();
}

/** Destrava a importação; recusa a que não está travada. */
export function destravar(travada: boolean): void {
  if (!travada) throw new ImportacaoNaoTravadaError();
}
