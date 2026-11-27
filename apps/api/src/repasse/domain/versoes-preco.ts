import { ErroDeDominio } from '../../comum/erro-de-dominio';
import {
  anterior,
  type ContextoVigencia,
  proxima,
  VigenciaRepasseInvalidaError,
  validarAPartirDe,
} from './vigencia';

/** "2026-11" → "11/2026". */
export const mesAno = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;

/** O arranjo do preço de repasse. */
export interface ArranjoPreco {
  modalidadeId: string;
  especialidadeId: string;
  categoriaId: string;
  prioridadeId: string;
}

/** O que a pessoa informa: o arranjo, o cliente (nulo = todos os clientes) e o valor. */
export interface DadosPrecoRepasse extends ArranjoPreco {
  clienteId: string | null;
  valorCentavos: number;
}

export interface VersaoPrecoRepasse extends DadosPrecoRepasse {
  id: string;
  vigenciaDesde: string | null;
  vigenciaAte: string | null;
}

/**
 * O que gravar. Nada se sobrescreve: a versão é encerrada (conferindo o `vigencia_ate` lido contra
 * edição simultânea) ou, se nunca valeu, apagada; o novo é sempre versão nova.
 */
export type MudancaPrecoRepasse =
  | { tipo: 'criar'; dados: DadosPrecoRepasse; vigenciaDesde: string; vigenciaAte: string | null }
  | { tipo: 'encerrar'; id: string; vigenciaAteAntes: string | null; vigenciaAte: string }
  | { tipo: 'remover'; id: string; vigenciaAteAntes: string | null }
  | { tipo: 'reabrir'; id: string; vigenciaAteAntes: string; vigenciaAte: string | null };

export class PrecoRepasseInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class VersaoPrecoConflitanteError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super(
      'Já existe preço para este arranjo e cliente nesse período. Altere o que existe em vez de incluir outro.',
    );
  }
}

export class PrecoRepasseNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor() {
    super('Preço não encontrado.');
  }
}

export class PrecoRepasseAlteradoError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super(
      'Este preço acabou de ser alterado por outra pessoa. Recarregue a tabela e tente de novo.',
    );
  }
}

/** Limite da coluna `integer` em centavos. */
const VALOR_MAXIMO_CENTAVOS = 2_147_483_647;

function validarDados(d: DadosPrecoRepasse) {
  if (!(Number.isInteger(d.valorCentavos) && d.valorCentavos > 0))
    throw new PrecoRepasseInvalidoError('O valor tem de ser maior que zero.');
  if (d.valorCentavos > VALOR_MAXIMO_CENTAVOS)
    throw new PrecoRepasseInvalidoError('O valor passa do máximo (R$ 21.474.836,47).');
}

/** Mesmo arranjo e mesmo cliente (ou os dois para todos): versões do mesmo preço. */
export const mesmaChave = (a: DadosPrecoRepasse, b: DadosPrecoRepasse) =>
  a.modalidadeId === b.modalidadeId &&
  a.especialidadeId === b.especialidadeId &&
  a.categoriaId === b.categoriaId &&
  a.prioridadeId === b.prioridadeId &&
  a.clienteId === b.clienteId;

const cruzam = (
  a: { desde: string | null; ate: string | null },
  b: { desde: string | null; ate: string | null },
) =>
  (a.ate === null || b.desde === null || b.desde <= a.ate) &&
  (b.ate === null || a.desde === null || a.desde <= b.ate);

function exigirSemConflito(
  dados: DadosPrecoRepasse,
  periodo: { desde: string; ate: string | null },
  versoes: readonly VersaoPrecoRepasse[],
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
    throw new VersaoPrecoConflitanteError();
}

const exigirVersao = (id: string, versoes: readonly VersaoPrecoRepasse[]) => {
  const v = versoes.find((x) => x.id === id);
  if (!v) throw new PrecoRepasseNaoEncontradoError();
  return v;
};

const nuncaValeu = (v: VersaoPrecoRepasse, ctx: ContextoVigencia) =>
  v.vigenciaDesde !== null && v.vigenciaDesde > ctx.mesAtual;

export function planejarInclusao(
  dados: DadosPrecoRepasse,
  aPartirDe: string,
  versoes: readonly VersaoPrecoRepasse[],
  ctx: ContextoVigencia,
): MudancaPrecoRepasse[] {
  validarAPartirDe(aPartirDe, ctx);
  validarDados(dados);
  exigirSemConflito(dados, { desde: aPartirDe, ate: null }, versoes);
  return [{ tipo: 'criar', dados, vigenciaDesde: aPartirDe, vigenciaAte: null }];
}

/**
 * Alterar: a versão vale até a véspera de `aPartirDe` e nasce outra até onde a antiga ia. A
 * programada que nunca valeu e começa em `aPartirDe` é trocada; a que já valeu nunca é apagada.
 */
export function planejarAlteracao(
  id: string,
  dados: DadosPrecoRepasse,
  aPartirDe: string,
  versoes: readonly VersaoPrecoRepasse[],
  ctx: ContextoVigencia,
): MudancaPrecoRepasse[] {
  validarAPartirDe(aPartirDe, ctx);
  validarDados(dados);
  const v = exigirVersao(id, versoes);
  if (v.vigenciaAte !== null && v.vigenciaAte < aPartirDe)
    throw new VigenciaRepasseInvalidaError(
      `Este preço valeu até ${mesAno(v.vigenciaAte)}; não há o que alterar a partir de ${mesAno(aPartirDe)}.`,
    );
  if (mesmaChave(v, dados) && v.valorCentavos === dados.valorCentavos)
    throw new PrecoRepasseInvalidoError('Nada mudou no preço.');
  if (v.vigenciaDesde !== null && v.vigenciaDesde > aPartirDe)
    throw new VigenciaRepasseInvalidaError(
      `Este preço começa em ${mesAno(v.vigenciaDesde)}; a alteração tem de valer a partir dela.`,
    );
  exigirSemConflito(dados, { desde: aPartirDe, ate: v.vigenciaAte }, versoes, v.id);
  const novo: MudancaPrecoRepasse = {
    tipo: 'criar',
    dados,
    vigenciaDesde: aPartirDe,
    vigenciaAte: v.vigenciaAte,
  };
  if (v.vigenciaDesde === aPartirDe) {
    if (!nuncaValeu(v, ctx))
      throw new VigenciaRepasseInvalidaError(
        `Este preço vale desde ${mesAno(aPartirDe)} e não se reescreve: a alteração vale a partir de ${mesAno(proxima(aPartirDe))} ou depois.`,
      );
    return [{ tipo: 'remover', id: v.id, vigenciaAteAntes: v.vigenciaAte }, novo];
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
 * Encerrar: a versão vale até a véspera de `aPartirDe`. A programada que nunca valeu e não chegaria
 * a valer é apagada (cancelada), e a versão que ela substituiu volta a valer até onde ela ia.
 */
export function planejarEncerramento(
  id: string,
  aPartirDe: string,
  versoes: readonly VersaoPrecoRepasse[],
  ctx: ContextoVigencia,
): MudancaPrecoRepasse[] {
  validarAPartirDe(aPartirDe, ctx);
  const v = exigirVersao(id, versoes);
  if (v.vigenciaAte !== null && v.vigenciaAte < aPartirDe)
    throw new VigenciaRepasseInvalidaError(`Este preço já valeu só até ${mesAno(v.vigenciaAte)}.`);
  if (v.vigenciaDesde !== null && v.vigenciaDesde >= aPartirDe) {
    if (!nuncaValeu(v, ctx))
      throw new VigenciaRepasseInvalidaError(
        `Este preço vale desde ${mesAno(v.vigenciaDesde)} e não se apaga: encerre a partir de ${mesAno(proxima(v.vigenciaDesde))} ou depois.`,
      );
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
  return [
    {
      tipo: 'encerrar',
      id: v.id,
      vigenciaAteAntes: v.vigenciaAte,
      vigenciaAte: anterior(aPartirDe),
    },
  ];
}

/** Ids das versões com outra do mesmo arranjo e cliente cuja vigência se cruza (cadastro repetido). */
export function precosRepetidos(versoes: readonly VersaoPrecoRepasse[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < versoes.length; i++)
    for (let j = i + 1; j < versoes.length; j++) {
      const [a, b] = [versoes[i] as VersaoPrecoRepasse, versoes[j] as VersaoPrecoRepasse];
      if (
        mesmaChave(a, b) &&
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
