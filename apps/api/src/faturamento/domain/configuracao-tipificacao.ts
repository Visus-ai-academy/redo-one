import { ErroDeDominio } from '../../comum/erro-de-dominio';
import type { ConfiguracaoCliente, TipoLinha } from './tipificacao';

export class TipificacaoInvalidaError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class NomeTipificacaoEmUsoError extends ErroDeDominio {
  readonly tipo = 'conflito';
  constructor() {
    super('Já existe uma regra ou sub-regra com esse nome.');
  }
}

export class RegraTipificacaoNaoEncontradaError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor(oQue = 'Regra') {
    super(`${oQue} não encontrada.`);
  }
}

type Configuracao = Omit<ConfiguracaoCliente, 'clienteId'>;

const MAXIMO_LINHAS = 100;
/** Ids ordenados e sem repetidos: a configuração gravada e a nova se comparam sem depender da ordem. */
const unicos = (lista: string[]) => [...new Set(lista)].sort();

/** O que a configuração pode citar. */
export interface Conhecidos {
  regras: ReadonlySet<string>;
  subregras: ReadonlySet<string>;
  /** Regras e sub-regras inativas: não entram em linha nova, mas seguem onde já estavam. */
  inativas: ReadonlySet<string>;
  /** Regras e sub-regras da configuração gravada do cliente. */
  jaGravados: ReadonlySet<string>;
  /** Ids do catálogo por tipo de linha (inclusive inativos). */
  valores: Record<TipoLinha, ReadonlySet<string>>;
  medicos: ReadonlySet<string>;
  equipes: ReadonlySet<string>;
}

const ROTULO_VALOR: Record<TipoLinha, string> = {
  modalidade: 'modalidade não encontrada',
  especialidade: 'especialidade não encontrada',
  prioridade: 'prioridade não encontrada',
};

/**
 * Confere e normaliza a configuração do cliente antes de gravar: valores sem repetidos e
 * ordenados, filtro de médico coerente com o modo, ids conhecidos e do tipo certo, e nada inativo
 * que já não estivesse gravado. A vazia vira nula (segue a do principal ou a padrão).
 */
export function prepararConfiguracao(c: Configuracao, conhecidos: Conhecidos): Configuracao | null {
  const ativa = (id: string, onde: string) => {
    if (conhecidos.inativas.has(id) && !conhecidos.jaGravados.has(id))
      throw new TipificacaoInvalidaError(`${onde} inativa: escolha uma ativa.`);
  };
  if (c.regraId) {
    if (!conhecidos.regras.has(c.regraId))
      throw new TipificacaoInvalidaError('Regra principal não encontrada.');
    ativa(c.regraId, 'Regra principal');
  }
  if (c.subregraDemaisId) {
    if (!conhecidos.subregras.has(c.subregraDemaisId))
      throw new TipificacaoInvalidaError('Sub-regra de "todos os demais" não encontrada.');
    ativa(c.subregraDemaisId, 'Sub-regra de "todos os demais"');
  }
  if (c.linhas.length > MAXIMO_LINHAS)
    throw new TipificacaoInvalidaError(`No máximo ${MAXIMO_LINHAS} linhas.`);
  const linhas = c.linhas.map((l, i) => {
    const onde = `Linha ${i + 1}`;
    const valores = unicos(l.valores);
    if (!valores.length)
      throw new TipificacaoInvalidaError(`${onde}: escolha pelo menos um valor.`);
    if (valores.some((v) => !conhecidos.valores[l.tipo].has(v)))
      throw new TipificacaoInvalidaError(`${onde}: ${ROTULO_VALOR[l.tipo]}.`);
    if (!conhecidos.subregras.has(l.subregraId))
      throw new TipificacaoInvalidaError(`${onde}: sub-regra não encontrada.`);
    ativa(l.subregraId, `${onde}: sub-regra`);
    const todos = l.modoMedico === 'todos';
    const medicos = todos ? [] : unicos(l.medicos);
    const equipes = todos ? [] : unicos(l.equipes);
    if (!todos && !medicos.length && !equipes.length)
      throw new TipificacaoInvalidaError(`${onde}: escolha os médicos ou equipes do filtro.`);
    if (medicos.some((m) => !conhecidos.medicos.has(m)))
      throw new TipificacaoInvalidaError(`${onde}: médico não encontrado.`);
    if (equipes.some((e) => !conhecidos.equipes.has(e)))
      throw new TipificacaoInvalidaError(`${onde}: equipe não encontrada.`);
    return { ...l, valores, medicos, equipes };
  });
  if (!c.regraId && !c.subregraDemaisId && !linhas.length) return null;
  return { regraId: c.regraId, subregraDemaisId: c.subregraDemaisId, linhas };
}

const COR = /^#[0-9a-f]{6}$/i;

/** Nome aparado e obrigatório; descrição vazia vira nula; cor `#rrggbb`. */
export function prepararRegra<
  T extends { nome: string; descricao: string | null; cor?: string | null },
>(d: T): T {
  const nome = d.nome.trim();
  if (!nome) throw new TipificacaoInvalidaError('Informe o nome.');
  const descricao = d.descricao?.trim() || null;
  if (d.cor !== undefined && d.cor !== null && !COR.test(d.cor))
    throw new TipificacaoInvalidaError('Cor no formato #RRGGBB.');
  return {
    ...d,
    nome,
    descricao,
    ...(d.cor !== undefined ? { cor: d.cor?.toLowerCase() ?? null } : {}),
  };
}
