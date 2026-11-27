import { ErroDeDominio } from '../../comum/erro-de-dominio';
import {
  type MudancaVersao,
  planejarAlteracaoVersao,
  planejarEncerramentoVersao,
  type Versionada,
} from './versoes';
import {
  type ArranjoPreco,
  type MudancaPrecoRepasse,
  planejarAlteracao,
  planejarInclusao,
  type VersaoPrecoRepasse,
} from './versoes-preco';
import { type ContextoVigencia, validarAPartirDe, vigenteEm } from './vigencia';

/** Linha da régua: nível × modalidade × especialidade × categoria (ou todas) × prioridade (ou todas). */
export interface DadosRegua {
  nivelId: string;
  modalidadeId: string;
  especialidadeId: string;
  /** Nulo = todas as categorias (explícito na tela). */
  categoriaId: string | null;
  /** Nulo = todas as prioridades. */
  prioridadeId: string | null;
  valorCentavos: number;
}

export interface VersaoRegua extends DadosRegua, Versionada {}

export class ReguaInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class ReguaConflitanteError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super('A régua já tem valor para este nível e arranjo nesse período: altere o que existe.');
  }
}

export const mesmaLinha = (a: DadosRegua, b: DadosRegua) =>
  a.nivelId === b.nivelId &&
  a.modalidadeId === b.modalidadeId &&
  a.especialidadeId === b.especialidadeId &&
  a.categoriaId === b.categoriaId &&
  a.prioridadeId === b.prioridadeId;

const cruzam = (a: Versionada, b: { vigenciaDesde: string | null; vigenciaAte: string | null }) =>
  (a.vigenciaAte === null || b.vigenciaDesde === null || b.vigenciaDesde <= a.vigenciaAte) &&
  (b.vigenciaAte === null || a.vigenciaDesde === null || a.vigenciaDesde <= b.vigenciaAte);

function validarValor(v: number) {
  if (!(Number.isInteger(v) && v > 0 && v <= 2_147_483_647))
    throw new ReguaInvalidaError('O valor tem de ser maior que zero.');
}

function semConflito(
  d: DadosRegua,
  periodo: { vigenciaDesde: string; vigenciaAte: string | null },
  versoes: readonly VersaoRegua[],
  ignorar?: string,
) {
  if (versoes.some((v) => v.id !== ignorar && mesmaLinha(v, d) && cruzam(v, periodo)))
    throw new ReguaConflitanteError();
}

/** Nova linha a partir de `aPartirDe`. */
export function planejarInclusaoRegua(
  d: DadosRegua,
  aPartirDe: string,
  versoes: readonly VersaoRegua[],
  ctx: ContextoVigencia,
) {
  validarAPartirDe(aPartirDe, ctx);
  validarValor(d.valorCentavos);
  semConflito(d, { vigenciaDesde: aPartirDe, vigenciaAte: null }, versoes);
  return {
    mudancas: [] as MudancaVersao[],
    nova: { ...d, vigenciaDesde: aPartirDe, vigenciaAte: null },
  };
}

/** Novo valor: a versão vale até a véspera e a nova dali até onde ela ia. */
export function planejarAlteracaoRegua(
  id: string,
  valorCentavos: number,
  aPartirDe: string,
  versoes: readonly VersaoRegua[],
  ctx: ContextoVigencia,
) {
  validarValor(valorCentavos);
  const v = versoes.find((x) => x.id === id);
  if (v && v.valorCentavos === valorCentavos) throw new ReguaInvalidaError('Nada mudou no valor.');
  const { mudancas, vigenciaAte } = planejarAlteracaoVersao(id, aPartirDe, versoes, ctx);
  const atual = v as VersaoRegua;
  const { id: _, vigenciaDesde: __, vigenciaAte: ___, ...dados } = atual;
  return {
    mudancas,
    nova: { ...dados, valorCentavos, vigenciaDesde: aPartirDe, vigenciaAte },
  };
}

export function planejarEncerramentoRegua(
  id: string,
  aPartirDe: string,
  versoes: readonly VersaoRegua[],
  ctx: ContextoVigencia,
): MudancaVersao[] {
  return planejarEncerramentoVersao(id, aPartirDe, versoes, ctx, mesmaLinha);
}

/** O que existe no catálogo para abrir o "todas": categorias de cada modalidade × especialidade. */
export interface CatalogoRegua {
  /** Categorias dos exames ativos da modalidade e especialidade. */
  categoriasDe: (modalidadeId: string, especialidadeId: string) => readonly string[];
  /** Prioridades ativas. */
  prioridades: readonly string[];
}

const chaveArranjo = (a: ArranjoPreco) =>
  [a.modalidadeId, a.especialidadeId, a.categoriaId, a.prioridadeId].join('|');

/**
 * A régua do nível vigente na competência, aberta em arranjos completos. A linha mais específica
 * vence: categoria e prioridade escolhidas antes de "todas".
 */
export function expandirRegua(
  linhas: readonly VersaoRegua[],
  competencia: string,
  catalogo: CatalogoRegua,
): Map<string, ArranjoPreco & { valorCentavos: number }> {
  const peso = (l: DadosRegua) => (l.categoriaId ? 2 : 0) + (l.prioridadeId ? 1 : 0);
  const r = new Map<string, ArranjoPreco & { valorCentavos: number; peso: number }>();
  for (const l of linhas.filter((x) => vigenteEm(x, competencia))) {
    const categorias = l.categoriaId
      ? [l.categoriaId]
      : catalogo.categoriasDe(l.modalidadeId, l.especialidadeId);
    const prioridades = l.prioridadeId ? [l.prioridadeId] : catalogo.prioridades;
    for (const categoriaId of categorias)
      for (const prioridadeId of prioridades) {
        const a = {
          modalidadeId: l.modalidadeId,
          especialidadeId: l.especialidadeId,
          categoriaId,
          prioridadeId,
        };
        const k = chaveArranjo(a);
        const atual = r.get(k);
        if (!atual || atual.peso < peso(l))
          r.set(k, { ...a, valorCentavos: l.valorCentavos, peso: peso(l) });
      }
  }
  return new Map([...r].map(([k, { peso: _, ...v }]) => [k, v]));
}

export type AcaoPreenchimento = 'incluir' | 'alterar' | 'igual' | 'programado';

export interface ItemPreenchimento extends ArranjoPreco {
  atualCentavos: number | null;
  novoCentavos: number;
  acao: AcaoPreenchimento;
}

/**
 * O que "Preencher pela régua do nível" faz nos preços de todos os clientes do médico, a partir de
 * `aPartirDe`: inclui o arranjo sem preço, altera o de valor diferente e deixa o igual. O arranjo
 * com preço programado depois de `aPartirDe` fica como está (a pessoa decide nele).
 */
export function planejarPreenchimento(
  regua: ReadonlyMap<string, ArranjoPreco & { valorCentavos: number }>,
  precos: readonly VersaoPrecoRepasse[],
  aPartirDe: string,
  ctx: ContextoVigencia,
): { itens: ItemPreenchimento[]; mudancas: MudancaPrecoRepasse[] } {
  validarAPartirDe(aPartirDe, ctx);
  const itens: ItemPreenchimento[] = [];
  const mudancas: MudancaPrecoRepasse[] = [];
  for (const a of regua.values()) {
    const daChave = precos.filter(
      (p) => p.clienteId === null && chaveArranjo(p) === chaveArranjo(a),
    );
    const dados = { ...a, clienteId: null };
    const base = {
      modalidadeId: a.modalidadeId,
      especialidadeId: a.especialidadeId,
      categoriaId: a.categoriaId,
      prioridadeId: a.prioridadeId,
      novoCentavos: a.valorCentavos,
    };
    if (daChave.some((p) => p.vigenciaDesde !== null && p.vigenciaDesde > aPartirDe)) {
      itens.push({ ...base, atualCentavos: null, acao: 'programado' });
      continue;
    }
    const vale = daChave.find((p) => vigenteEm(p, aPartirDe));
    if (!vale) {
      mudancas.push(...planejarInclusao(dados, aPartirDe, precos, ctx));
      itens.push({ ...base, atualCentavos: null, acao: 'incluir' });
    } else if (vale.valorCentavos === a.valorCentavos) {
      itens.push({ ...base, atualCentavos: vale.valorCentavos, acao: 'igual' });
    } else {
      mudancas.push(...planejarAlteracao(vale.id, dados, aPartirDe, precos, ctx));
      itens.push({ ...base, atualCentavos: vale.valorCentavos, acao: 'alterar' });
    }
  }
  return { itens, mudancas };
}
