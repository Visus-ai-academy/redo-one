import { ErroDeDominio } from '../../comum/erro-de-dominio';
import { anterior, aPartirDeMinimo, type ContextoVigencia, proxima } from './versoes-preco';
import { mesAno } from './vigencia-corte';

/**
 * Versões por competência da tipificação: a configuração do cliente (como um todo), o "fatura" da
 * sub-regra e o "fatura sem sub-regra" da regra. Uma linha do tempo só por dono, sem buracos nem
 * sobreposição. Nada se sobrescreve: mudar encerra a versão vigente na competência anterior e cria
 * outra; só a versão programada que nunca valeu pode ser apagada (e a anterior volta a valer).
 */
export interface VersaoVigente<T> {
  id: string;
  /** "YYYY-MM", inclusivo; nulo = sem início (a versão inicial, da carga: vale para tudo antes). */
  vigenciaDesde: string | null;
  /** "YYYY-MM", inclusivo; nulo = sem fim. */
  vigenciaAte: string | null;
  valor: T;
}

export type MudancaVersao<T> =
  | { tipo: 'criar'; vigenciaDesde: string; vigenciaAte: string | null; valor: T }
  | { tipo: 'encerrar'; id: string; vigenciaAteAntes: string | null; vigenciaAte: string }
  | { tipo: 'remover'; id: string }
  /** A versão encerrada para dar lugar à programada que saiu volta a valer até onde a programada ia. */
  | { tipo: 'reabrir'; id: string; vigenciaAteAntes: string; vigenciaAte: string | null };

export class VigenciaTipificacaoInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class NadaMudouError extends ErroDeDominio {
  readonly tipo = 'invalido';
  constructor() {
    super('Nada mudou em relação ao que vale nessa competência.');
  }
}

export class VersaoTipificacaoNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Versão não encontrada.');
  }
}

/** O "fatura" não tem herança: sem versão nenhuma, não haveria o que valer. */
export class UnicaVersaoError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super(
      'Esta é a única versão: sem ela não haveria o que valer. Para mudar, crie outra versão a partir de uma competência.',
    );
  }
}

/** Outra pessoa mudou a versão entre a leitura e a gravação. */
export class VersaoTipificacaoAlteradaError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super('A tipificação acabou de ser alterada por outra pessoa. Recarregue e tente de novo.');
  }
}

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A versão cujo período contém a competência. */
export function vigenteEm<V extends { vigenciaDesde: string | null; vigenciaAte: string | null }>(
  versoes: readonly V[],
  competencia: string,
): V | undefined {
  return versoes.find(
    (v) =>
      (v.vigenciaDesde === null || v.vigenciaDesde <= competencia) &&
      (v.vigenciaAte === null || competencia <= v.vigenciaAte),
  );
}

/** Pelo início, a sem início primeiro. */
export const pelaVigencia = (
  a: { vigenciaDesde: string | null },
  b: { vigenciaDesde: string | null },
) => (a.vigenciaDesde ?? '').localeCompare(b.vigenciaDesde ?? '');

/** A mudança vale a partir de uma competência aberta ou futura, depois de toda fechada ou travada. */
export function validarAPartirDe(aPartirDe: string, ctx: ContextoVigencia): void {
  if (!COMPETENCIA.test(aPartirDe))
    throw new VigenciaTipificacaoInvalidaError('Informe a competência no formato AAAA-MM.');
  const minimo = aPartirDeMinimo(ctx);
  if (aPartirDe < minimo)
    throw new VigenciaTipificacaoInvalidaError(
      ctx.bloqueadas.length
        ? `A tipificação só muda a partir de uma competência aberta ou futura: de ${mesAno(minimo)} em diante (a anterior está fechada ou travada).`
        : `A tipificação só muda a partir de ${mesAno(minimo)}.`,
    );
  if (ctx.bloqueadas.includes(aPartirDe))
    throw new VigenciaTipificacaoInvalidaError(
      `A competência ${mesAno(aPartirDe)} está fechada ou travada: a tipificação não muda nela.`,
    );
}

const nuncaValeu = (v: VersaoVigente<unknown>, ctx: ContextoVigencia) =>
  v.vigenciaDesde !== null && v.vigenciaDesde > ctx.mesAtual;

/**
 * Mudar a partir de `aPartirDe`: a versão vigente nela passa a valer até a competência anterior e
 * nasce outra com o valor novo, até onde a antiga ia (sem versão, até a véspera da próxima). A
 * programada que nunca valeu e começa em `aPartirDe` é trocada; a que já valeu não se reescreve.
 * `igual` compara o que vale hoje (nulo = sem versão) com o novo.
 */
export function planejarMudanca<T>(
  versoes: readonly VersaoVigente<T>[],
  valor: T,
  aPartirDe: string,
  ctx: ContextoVigencia,
  igual: (atual: T | null, novo: T) => boolean,
): MudancaVersao<T>[] {
  validarAPartirDe(aPartirDe, ctx);
  const v = vigenteEm(versoes, aPartirDe);
  if (igual(v ? v.valor : null, valor)) throw new NadaMudouError();
  if (!v) {
    const seguinte = versoes
      .filter((x) => x.vigenciaDesde !== null && x.vigenciaDesde > aPartirDe)
      .sort(pelaVigencia)[0];
    return [
      {
        tipo: 'criar',
        vigenciaDesde: aPartirDe,
        vigenciaAte: seguinte?.vigenciaDesde ? anterior(seguinte.vigenciaDesde) : null,
        valor,
      },
    ];
  }
  const novo: MudancaVersao<T> = {
    tipo: 'criar',
    vigenciaDesde: aPartirDe,
    vigenciaAte: v.vigenciaAte,
    valor,
  };
  if (v.vigenciaDesde === aPartirDe) {
    if (!nuncaValeu(v, ctx))
      throw new VigenciaTipificacaoInvalidaError(
        `Esta versão vale desde ${mesAno(aPartirDe)} e não se reescreve: a mudança vale a partir de ${mesAno(proxima(aPartirDe))} ou depois.`,
      );
    return [{ tipo: 'remover', id: v.id }, novo];
  }
  return [
    {
      tipo: 'encerrar',
      id: v.id,
      vigenciaAteAntes: v.vigenciaAte,
      vigenciaAte: anterior(aPartirDe),
    },
    novo,
  ];
}

/**
 * Apagar a versão programada que nunca valeu: a anterior volta a valer até onde ela ia. Com
 * `exigirOutra` (o "fatura", que não tem herança), a única versão não se apaga.
 */
export function planejarRemocao<T>(
  versoes: readonly VersaoVigente<T>[],
  id: string,
  ctx: ContextoVigencia,
  opcoes: { exigirOutra?: boolean } = {},
): MudancaVersao<T>[] {
  const v = versoes.find((x) => x.id === id);
  if (!v) throw new VersaoTipificacaoNaoEncontradaError();
  if (v.vigenciaDesde === null || !nuncaValeu(v, ctx))
    throw new VigenciaTipificacaoInvalidaError(
      `Esta versão já valeu e não se apaga: para mudar, crie outra a partir de uma competência aberta ou futura.`,
    );
  if (opcoes.exigirOutra && versoes.length === 1) throw new UnicaVersaoError();
  const desde = v.vigenciaDesde;
  validarAPartirDe(desde, ctx);
  const antecessora = versoes.find((x) => x.id !== v.id && x.vigenciaAte === anterior(desde));
  return [
    { tipo: 'remover', id: v.id },
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

/** As versões como ficariam depois das mudanças (a prévia), ordenadas pelo início. */
export function aplicarMudancas<T>(
  versoes: readonly VersaoVigente<T>[],
  mudancas: readonly MudancaVersao<T>[],
  novoId: () => string,
): VersaoVigente<T>[] {
  let r = [...versoes];
  for (const m of mudancas) {
    if (m.tipo === 'criar')
      r.push({
        id: novoId(),
        vigenciaDesde: m.vigenciaDesde,
        vigenciaAte: m.vigenciaAte,
        valor: m.valor,
      });
    else if (m.tipo === 'remover') r = r.filter((v) => v.id !== m.id);
    else r = r.map((v) => (v.id === m.id ? { ...v, vigenciaAte: m.vigenciaAte } : v));
  }
  return r.sort(pelaVigencia);
}
