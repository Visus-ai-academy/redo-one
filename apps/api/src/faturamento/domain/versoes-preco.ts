import { ErroDeDominio } from '../../comum/erro-de-dominio';
import type { Arranjo, CondVolume } from './preco';
import { mesAno } from './vigencia-corte';

/** O que a pessoa informa de um preço: o arranjo, a faixa opcional, o condVolume e o valor. */
export interface DadosPreco extends Arranjo {
  faixaInicio: number | null;
  faixaFim: number | null;
  condVolume: CondVolume;
  valor: number;
}

/** Uma versão gravada: os dados e a vigência ("YYYY-MM" inclusivos; vazio = sem limite). */
export interface VersaoPreco extends DadosPreco {
  id: string;
  vigenciaDesde: string | null;
  vigenciaAte: string | null;
}

/** O que a regra de vigência precisa saber das competências. */
export interface ContextoVigencia {
  /** Mês atual em Brasília ("YYYY-MM"): versão que começa depois dele nunca valeu. */
  mesAtual: string;
  /** Competências fechadas ou com a importação travada: o preço delas nunca muda. */
  bloqueadas: readonly string[];
}

/**
 * O que gravar. Nada se sobrescreve: a versão é encerrada (só o `vigencia_ate`, conferindo o
 * anterior contra edição simultânea) ou, se nunca valeu, apagada; o novo é sempre versão nova.
 */
export type MudancaPreco =
  | { tipo: 'criar'; dados: DadosPreco; vigenciaDesde: string; vigenciaAte: string | null }
  | { tipo: 'encerrar'; id: string; vigenciaAteAntes: string | null; vigenciaAte: string }
  | { tipo: 'remover'; id: string };

export class PrecoInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class VigenciaPrecoInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class VersaoConflitanteError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super(
      'Já existe preço para este arranjo e faixa nesse período. Altere o que existe em vez de incluir outro.',
    );
  }
}

export class VersaoPrecoNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Preço não encontrado.');
  }
}

const COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Competência anterior ("2027-01" → "2026-12"). */
export function anterior(competencia: string): string {
  const [a, m] = competencia.split('-').map(Number) as [number, number];
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

/** Competência seguinte ("2026-12" → "2027-01"). */
export function proxima(competencia: string): string {
  const [a, m] = competencia.split('-').map(Number) as [number, number];
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

/** A mudança vale a partir de uma competência aberta ou futura, depois de toda fechada ou travada. */
export function validarAPartirDe(aPartirDe: string, ctx: ContextoVigencia): void {
  if (!COMPETENCIA.test(aPartirDe))
    throw new VigenciaPrecoInvalidaError('Informe a competência no formato AAAA-MM.');
  const ultima = [...ctx.bloqueadas].sort().at(-1);
  if (ultima !== undefined && aPartirDe <= ultima)
    throw new VigenciaPrecoInvalidaError(
      `O preço só muda a partir de uma competência aberta ou futura: depois de ${mesAno(ultima)}, que está fechada ou travada.`,
    );
}

export function validarDados(d: DadosPreco): void {
  if (!(Number.isFinite(d.valor) && d.valor > 0))
    throw new PrecoInvalidoError('O valor tem de ser maior que zero.');
  if (Math.abs(d.valor * 100 - Math.round(d.valor * 100)) > 1e-6)
    throw new PrecoInvalidoError('O valor tem no máximo dois decimais.');
  for (const f of [d.faixaInicio, d.faixaFim])
    if (f !== null && !(Number.isInteger(f) && f >= 0))
      throw new PrecoInvalidoError('A faixa é de números inteiros a partir de zero.');
  if (d.faixaInicio !== null && d.faixaFim !== null && d.faixaFim < d.faixaInicio)
    throw new PrecoInvalidoError('O fim da faixa tem de ser maior ou igual ao início.');
}

const mesmaChave = (a: DadosPreco, b: DadosPreco) =>
  a.modalidadeId === b.modalidadeId &&
  a.especialidadeId === b.especialidadeId &&
  a.categoriaId === b.categoriaId &&
  a.prioridadeId === b.prioridadeId &&
  a.faixaInicio === b.faixaInicio &&
  a.faixaFim === b.faixaFim;

/** Os dois períodos (desde/até inclusivos, vazio = sem limite) têm competência em comum. */
const cruzam = (
  a: { desde: string | null; ate: string | null },
  b: { desde: string | null; ate: string | null },
) =>
  (a.ate === null || b.desde === null || b.desde <= a.ate) &&
  (b.ate === null || a.desde === null || a.desde <= b.ate);

function exigirSemConflito(
  dados: DadosPreco,
  periodo: { desde: string; ate: string | null },
  versoes: readonly VersaoPreco[],
  ignorar?: string,
) {
  if (
    versoes.some(
      (v) =>
        v.id !== ignorar &&
        mesmaChave(v, dados) &&
        cruzam({ desde: v.vigenciaDesde, ate: v.vigenciaAte }, periodo),
    )
  )
    throw new VersaoConflitanteError();
}

const exigirVersao = (id: string, versoes: readonly VersaoPreco[]) => {
  const v = versoes.find((x) => x.id === id);
  if (!v) throw new VersaoPrecoNaoEncontradaError();
  return v;
};

const nuncaValeu = (v: VersaoPreco, ctx: ContextoVigencia) =>
  v.vigenciaDesde !== null && v.vigenciaDesde > ctx.mesAtual;

/** Incluir: versão nova a partir de `aPartirDe`, sem fim. */
export function planejarInclusao(
  dados: DadosPreco,
  aPartirDe: string,
  versoes: readonly VersaoPreco[],
  ctx: ContextoVigencia,
): MudancaPreco[] {
  validarAPartirDe(aPartirDe, ctx);
  validarDados(dados);
  exigirSemConflito(dados, { desde: aPartirDe, ate: null }, versoes);
  return [{ tipo: 'criar', dados, vigenciaDesde: aPartirDe, vigenciaAte: null }];
}

/**
 * Alterar: a versão passa a valer até a competência anterior a `aPartirDe` e nasce outra com os
 * dados novos, até onde a antiga ia. A versão programada que nunca valeu e começa em `aPartirDe` é
 * trocada (apagada e criada de novo); a que já valeu nunca é apagada.
 */
export function planejarAlteracao(
  id: string,
  dados: DadosPreco,
  aPartirDe: string,
  versoes: readonly VersaoPreco[],
  ctx: ContextoVigencia,
): MudancaPreco[] {
  validarAPartirDe(aPartirDe, ctx);
  validarDados(dados);
  const v = exigirVersao(id, versoes);
  if (v.vigenciaAte !== null && v.vigenciaAte < aPartirDe)
    throw new VigenciaPrecoInvalidaError(
      `Este preço valeu até ${mesAno(v.vigenciaAte)}; não há o que alterar a partir de ${mesAno(aPartirDe)}.`,
    );
  if (mesmaChave(v, dados) && v.condVolume === dados.condVolume && v.valor === dados.valor)
    throw new PrecoInvalidoError('Nada mudou no preço.');
  const novo: MudancaPreco = {
    tipo: 'criar',
    dados,
    vigenciaDesde: aPartirDe,
    vigenciaAte: v.vigenciaAte,
  };
  exigirSemConflito(dados, { desde: aPartirDe, ate: v.vigenciaAte }, versoes, v.id);
  if (v.vigenciaDesde !== null && v.vigenciaDesde > aPartirDe)
    throw new VigenciaPrecoInvalidaError(
      `Este preço começa em ${mesAno(v.vigenciaDesde)}; a alteração tem de valer a partir dela.`,
    );
  if (v.vigenciaDesde === aPartirDe) {
    if (!nuncaValeu(v, ctx))
      throw new VigenciaPrecoInvalidaError(
        `Este preço vale desde ${mesAno(aPartirDe)} e não se reescreve: a alteração vale a partir de ${mesAno(proxima(aPartirDe))} ou depois.`,
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
 * Encerrar (o "excluir" da tela): a versão passa a valer até a competência anterior a
 * `aPartirDe`. Só a versão programada que nunca valeu e não chegaria a valer é apagada de vez.
 */
export function planejarEncerramento(
  id: string,
  aPartirDe: string,
  versoes: readonly VersaoPreco[],
  ctx: ContextoVigencia,
): MudancaPreco[] {
  validarAPartirDe(aPartirDe, ctx);
  const v = exigirVersao(id, versoes);
  if (v.vigenciaAte !== null && v.vigenciaAte < aPartirDe)
    throw new VigenciaPrecoInvalidaError(`Este preço já valeu só até ${mesAno(v.vigenciaAte)}.`);
  if (v.vigenciaDesde !== null && v.vigenciaDesde >= aPartirDe) {
    if (!nuncaValeu(v, ctx))
      throw new VigenciaPrecoInvalidaError(
        `Este preço vale desde ${mesAno(v.vigenciaDesde)} e não se apaga: encerre a partir de ${mesAno(proxima(v.vigenciaDesde))} ou depois.`,
      );
    return [{ tipo: 'remover', id: v.id }];
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
 * Ids das versões com outra do mesmo arranjo cuja faixa e vigência se cruzam (a tela avisa: a
 * busca fica com a de maior início de faixa, mas em geral é cadastro repetido).
 */
export function arranjosDuplicados(versoes: readonly VersaoPreco[]): Set<string> {
  const ids = new Set<string>();
  const porArranjo = new Map<string, VersaoPreco[]>();
  for (const v of versoes) {
    const k = [v.modalidadeId, v.especialidadeId, v.categoriaId, v.prioridadeId].join('|');
    porArranjo.set(k, [...(porArranjo.get(k) ?? []), v]);
  }
  const faixasCruzam = (a: VersaoPreco, b: VersaoPreco) =>
    (a.faixaFim === null || (b.faixaInicio ?? 0) <= a.faixaFim) &&
    (b.faixaFim === null || (a.faixaInicio ?? 0) <= b.faixaFim);
  for (const lista of porArranjo.values())
    for (let i = 0; i < lista.length; i++)
      for (let j = i + 1; j < lista.length; j++) {
        const [a, b] = [lista[i] as VersaoPreco, lista[j] as VersaoPreco];
        if (
          faixasCruzam(a, b) &&
          cruzam(
            { desde: a.vigenciaDesde, ate: a.vigenciaAte },
            { desde: b.vigenciaDesde, ate: b.vigenciaAte },
          )
        ) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
  return ids;
}

/** Outra pessoa mudou a versão entre a leitura e a gravação. */
export class VersaoAlteradaError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super(
      'Este preço acabou de ser alterado por outra pessoa. Recarregue a tabela e tente de novo.',
    );
  }
}
