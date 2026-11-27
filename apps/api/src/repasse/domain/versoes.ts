import { ErroDeDominio } from '../../comum/erro-de-dominio';
import { mesAno } from './versoes-preco';
import {
  anterior,
  type ContextoVigencia,
  proxima,
  type Vigencia,
  VigenciaRepasseInvalidaError,
  validarAPartirDe,
  vigenteEm,
} from './vigencia';

/** Uma versão com vigência por competência (configuração do médico, regra, reclassificação...). */
export interface Versionada extends Vigencia {
  id: string;
}

/**
 * O que fazer com as versões que já existem. Nunca se sobrescreve: a versão é encerrada (conferindo
 * o `vigencia_ate` lido) ou, se é programada e nunca valeu, apagada; a anterior a ela volta.
 */
export type MudancaVersao =
  | { tipo: 'encerrar'; id: string; vigenciaAteAntes: string | null; vigenciaAte: string }
  | { tipo: 'remover'; id: string; vigenciaAteAntes: string | null }
  | { tipo: 'reabrir'; id: string; vigenciaAteAntes: string; vigenciaAte: string | null };

export class VersaoNaoEncontradaRepasseError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Versão não encontrada.');
  }
}

/** Outra pessoa mudou a versão entre a leitura e a gravação. */
export class VersaoAlteradaRepasseError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super('Esta versão acabou de ser alterada por outra pessoa. Recarregue e tente de novo.');
  }
}

export const programada = (v: Vigencia, ctx: Pick<ContextoVigencia, 'mesAtual'>) =>
  v.vigenciaDesde !== null && v.vigenciaDesde > ctx.mesAtual;

const exigir = <V extends Versionada>(id: string, versoes: readonly V[]) => {
  const v = versoes.find((x) => x.id === id);
  if (!v) throw new VersaoNaoEncontradaRepasseError();
  return v;
};

/**
 * Versão nova de uma configuração que tem uma versão só de cada vez (a do médico): a que vale em
 * `aPartirDe` é encerrada na véspera, ou trocada se é programada e começa nela. Uma versão que
 * começa depois de `aPartirDe` precisa ser excluída antes (nada some sem a pessoa ver).
 */
export function planejarVersaoUnica<V extends Versionada>(
  aPartirDe: string,
  versoes: readonly V[],
  ctx: ContextoVigencia,
): MudancaVersao[] {
  validarAPartirDe(aPartirDe, ctx);
  const depois = versoes.find((v) => v.vigenciaDesde !== null && v.vigenciaDesde > aPartirDe);
  if (depois)
    throw new VigenciaRepasseInvalidaError(
      `Já há uma versão programada a partir de ${mesAno(depois.vigenciaDesde as string)}: exclua-a antes ou faça a mudança a partir dela.`,
    );
  const atual = versoes.find((v) => vigenteEm(v, aPartirDe));
  if (!atual) return [];
  return substituir(atual, aPartirDe, ctx);
}

/** Encerra a versão na véspera de `aPartirDe` (ou a apaga, se é programada e começa nela). */
function substituir(v: Versionada, aPartirDe: string, ctx: ContextoVigencia): MudancaVersao[] {
  if (v.vigenciaDesde === aPartirDe) {
    if (!programada(v, ctx))
      throw new VigenciaRepasseInvalidaError(
        `A versão atual vale desde ${mesAno(aPartirDe)} e não se reescreve: a nova vale a partir de ${mesAno(proxima(aPartirDe))} ou depois.`,
      );
    return [{ tipo: 'remover', id: v.id, vigenciaAteAntes: v.vigenciaAte }];
  }
  return [
    {
      tipo: 'encerrar',
      id: v.id,
      vigenciaAteAntes: v.vigenciaAte,
      vigenciaAte: anterior(aPartirDe),
    },
  ];
}

/**
 * Alterar uma versão (regra, reclassificação): ela vale até a véspera de `aPartirDe` e a nova
 * nasce dali até onde ela ia (`vigenciaAte` devolvido). A programada que começa em `aPartirDe` é
 * trocada.
 */
export function planejarAlteracaoVersao<V extends Versionada>(
  id: string,
  aPartirDe: string,
  versoes: readonly V[],
  ctx: ContextoVigencia,
): { mudancas: MudancaVersao[]; vigenciaAte: string | null } {
  validarAPartirDe(aPartirDe, ctx);
  const v = exigir(id, versoes);
  if (v.vigenciaAte !== null && v.vigenciaAte < aPartirDe)
    throw new VigenciaRepasseInvalidaError(
      `Esta versão valeu até ${mesAno(v.vigenciaAte)}; não há o que alterar a partir de ${mesAno(aPartirDe)}.`,
    );
  if (v.vigenciaDesde !== null && v.vigenciaDesde > aPartirDe)
    throw new VigenciaRepasseInvalidaError(
      `Esta versão começa em ${mesAno(v.vigenciaDesde)}; a alteração tem de valer a partir dela.`,
    );
  return { mudancas: substituir(v, aPartirDe, ctx), vigenciaAte: v.vigenciaAte };
}

/**
 * Encerrar: a versão vale até a véspera de `aPartirDe`. A programada que não chegaria a valer é
 * cancelada (apagada), e a versão que ela substituiu (mesma `chave`, terminando na véspera dela)
 * volta a valer até onde ela ia.
 */
export function planejarEncerramentoVersao<V extends Versionada>(
  id: string,
  aPartirDe: string,
  versoes: readonly V[],
  ctx: ContextoVigencia,
  mesmaChave: (a: V, b: V) => boolean,
): MudancaVersao[] {
  validarAPartirDe(aPartirDe, ctx);
  const v = exigir(id, versoes);
  if (v.vigenciaAte !== null && v.vigenciaAte < aPartirDe)
    throw new VigenciaRepasseInvalidaError(`Esta versão já valeu só até ${mesAno(v.vigenciaAte)}.`);
  if (v.vigenciaDesde !== null && v.vigenciaDesde >= aPartirDe) {
    if (!programada(v, ctx))
      throw new VigenciaRepasseInvalidaError(
        `Esta versão vale desde ${mesAno(v.vigenciaDesde)} e não se apaga: encerre a partir de ${mesAno(proxima(v.vigenciaDesde))} ou depois.`,
      );
    return cancelar(v, versoes, mesmaChave);
  }
  return [
    {
      tipo: 'encerrar',
      id: v.id,
      vigenciaAteAntes: v.vigenciaAte,
      vigenciaAte: anterior(aPartirDe),
    },
  ];
}

/**
 * Cancelar a versão programada criada por engano: ela some (nunca valeu) e a anterior da mesma
 * chave volta a valer até onde ela ia. Só a programada depois de toda competência fechada.
 */
export function planejarCancelamento<V extends Versionada>(
  id: string,
  versoes: readonly V[],
  ctx: ContextoVigencia,
  mesmaChave: (a: V, b: V) => boolean,
): MudancaVersao[] {
  const v = exigir(id, versoes);
  if (!programada(v, ctx))
    throw new VigenciaRepasseInvalidaError(
      'Só a versão programada (que ainda não valeu) pode ser cancelada; a que já valeu se encerra.',
    );
  validarAPartirDe(v.vigenciaDesde as string, ctx);
  return cancelar(v, versoes, mesmaChave);
}

function cancelar<V extends Versionada>(
  v: V,
  versoes: readonly V[],
  mesmaChave: (a: V, b: V) => boolean,
): MudancaVersao[] {
  const antecessora = versoes.find(
    (x) =>
      x.id !== v.id &&
      mesmaChave(x, v) &&
      x.vigenciaAte !== null &&
      x.vigenciaAte === anterior(v.vigenciaDesde as string),
  );
  return [
    { tipo: 'remover', id: v.id, vigenciaAteAntes: v.vigenciaAte },
    ...(antecessora
      ? [
          {
            tipo: 'reabrir' as const,
            id: antecessora.id,
            vigenciaAteAntes: antecessora.vigenciaAte as string,
            vigenciaAte: v.vigenciaAte,
          },
        ]
      : []),
  ];
}
