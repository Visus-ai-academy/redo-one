import { ErroDeDominio } from '../../comum/erro-de-dominio';
import {
  type Corte,
  diaBrasilia,
  EXAME_PADRAO,
  type TabelaCortes,
  type VigenciaCliente,
} from '../../ingestao/domain/competencia';

export class CompetenciaInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
  constructor() {
    super('A competência tem de estar no formato AAAA-MM, com o mês de 01 a 12.');
  }
}

export class VigenciaInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class VigenciaRepetidaError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor(desde: string) {
    super(`Já existe uma vigência a partir de ${mesAno(desde)}.`);
  }
}

export class ClienteNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Cliente não encontrado.');
  }
}

/** A unidade fatura pelo cliente principal: o corte dela é o dele. */
export class ClienteUnidadeError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor(principal: string) {
    super(`Este cliente é unidade de ${principal}; configure o corte no cliente principal.`);
  }
}

/** "YYYY-MM" com mês de 01 a 12. */
export function exigirCompetencia(competencia: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) throw new CompetenciaInvalidaError();
}

/** "2026-10" → "10/2026", como a pessoa lê. */
export const mesAno = (competencia: string) =>
  `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;

/** O mês da competência já acabou em horário de Brasília. */
export const mesAcabou = (competencia: string, agora: Date) =>
  competencia < diaBrasilia(agora).slice(0, 7);

/** Pedido de nova vigência, como chega da tela (o mesmo da prévia e da criação). */
export interface EntradaVigencia {
  /** Nulo = o corte padrão. */
  clienteId: string | null;
  /** Só com cliente: a partir de `desde` ele segue o padrão. */
  usaPadrao: boolean;
  dia: number | null;
  ultimoDia: boolean;
  mes: 'proprio' | 'seguinte' | null;
  consideraExame: boolean | null;
  /** Período da data do exame, com a mesma forma do laudo; vale quando `consideraExame`. */
  exameDia: number | null;
  exameUltimoDia: boolean;
  exameMes: 'proprio' | 'seguinte' | null;
}

export interface NovaVigencia {
  clienteId: string | null;
  desde: string;
  /** Nulo = "usa o padrão". */
  corte: Corte | null;
}

/** Corte da nova vigência; nulo com "usa o padrão" (os campos do corte são ignorados). */
export function corteDaEntrada(entrada: EntradaVigencia): Corte | null {
  if (entrada.usaPadrao) {
    if (entrada.clienteId === null) {
      throw new VigenciaInvalidaError('Só o corte de um cliente pode usar o padrão.');
    }
    return null;
  }
  const { dia, ultimoDia, mes, consideraExame } = entrada;
  if ((dia === null) === !ultimoDia) {
    throw new VigenciaInvalidaError('Informe o dia do corte ou o último dia do mês.');
  }
  if (dia !== null && !diaValido(dia)) {
    throw new VigenciaInvalidaError('O dia do corte tem de ser de 1 a 31.');
  }
  if (mes === null) throw new VigenciaInvalidaError('Informe o mês do corte.');
  if (consideraExame === null) {
    throw new VigenciaInvalidaError('Informe se o corte considera a data do exame.');
  }
  const { exameDia, exameUltimoDia, exameMes } = entrada;
  if ((exameDia === null) === !exameUltimoDia) {
    throw new VigenciaInvalidaError('Informe o dia do corte do exame ou o último dia do mês.');
  }
  if (exameDia !== null && !diaValido(exameDia)) {
    throw new VigenciaInvalidaError('O dia do corte do exame tem de ser de 1 a 31.');
  }
  if (exameMes === null) throw new VigenciaInvalidaError('Informe o mês do corte do exame.');
  return {
    dia: ultimoDia ? 'ultimo' : (dia as number),
    mes,
    consideraExame,
    exame: { dia: exameUltimoDia ? 'ultimo' : (exameDia as number), mes: exameMes },
  };
}

const diaValido = (dia: number) => Number.isInteger(dia) && dia >= 1 && dia <= 31;

/**
 * `desde` depois da última competência fechada: todo mês a partir dele está aberto, e a mudança de
 * corte não alcança mês fechado (nem há fechada depois dele).
 */
export function validarDesde(desde: string, ultimaFechada: string | null): void {
  if (ultimaFechada !== null && desde <= ultimaFechada) {
    throw new VigenciaInvalidaError(
      `A vigência tem de começar depois da última competência fechada (${mesAno(ultimaFechada)}).`,
    );
  }
}

/** A tabela de cortes como fica com a nova vigência (para a prévia). */
export function comNovaVigencia(tabela: TabelaCortes, nova: NovaVigencia): TabelaCortes {
  const ordem = <T extends { desde: string }>(l: T[]) =>
    l.sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0));
  if (nova.clienteId === null) {
    if (!nova.corte) throw new Error('A vigência padrão sempre tem corte.');
    return {
      padrao: ordem([...tabela.padrao, { desde: nova.desde, corte: nova.corte }]),
      porCliente: tabela.porCliente,
    };
  }
  const porCliente = new Map(tabela.porCliente);
  const doCliente: VigenciaCliente[] = porCliente.get(nova.clienteId) ?? [];
  porCliente.set(nova.clienteId, ordem([...doCliente, { desde: nova.desde, corte: nova.corte }]));
  return { padrao: tabela.padrao, porCliente };
}

/** O corte em campos, como a tabela e a tela o guardam (`usaPadrao` quando não há corte). */
export const camposDoCorte = (corte: Corte | null) => {
  const exame = corte ? (corte.exame ?? EXAME_PADRAO) : null;
  return {
    usaPadrao: corte === null,
    dia: corte && corte.dia !== 'ultimo' ? corte.dia : null,
    ultimoDia: corte?.dia === 'ultimo',
    mes: corte?.mes ?? null,
    consideraExame: corte?.consideraExame ?? null,
    exameDia: exame && exame.dia !== 'ultimo' ? exame.dia : null,
    exameUltimoDia: exame?.dia === 'ultimo',
    exameMes: exame?.mes ?? null,
  };
};
