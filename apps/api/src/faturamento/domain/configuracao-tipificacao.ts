import { ErroDeDominio } from '../../comum/erro-de-dominio';
import type { ConfiguracaoCliente } from './tipificacao';

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
const unicos = (lista: string[]) => [...new Set(lista)];

/**
 * Confere e normaliza a configuração do cliente antes de gravar: valores sem repetidos, filtro de
 * médico coerente com o modo, ids conhecidos. A vazia vira nula (segue a do principal ou a padrão).
 */
export function prepararConfiguracao(
  c: Configuracao,
  conhecidos: { regras: ReadonlySet<string>; subregras: ReadonlySet<string> },
): Configuracao | null {
  if (c.regraId && !conhecidos.regras.has(c.regraId))
    throw new TipificacaoInvalidaError('Regra principal não encontrada.');
  if (c.subregraDemaisId && !conhecidos.subregras.has(c.subregraDemaisId))
    throw new TipificacaoInvalidaError('Sub-regra de "todos os demais" não encontrada.');
  if (c.linhas.length > MAXIMO_LINHAS)
    throw new TipificacaoInvalidaError(`No máximo ${MAXIMO_LINHAS} linhas.`);
  const linhas = c.linhas.map((l, i) => {
    const onde = `Linha ${i + 1}`;
    const valores = unicos(l.valores);
    if (!valores.length)
      throw new TipificacaoInvalidaError(`${onde}: escolha pelo menos um valor.`);
    if (!conhecidos.subregras.has(l.subregraId))
      throw new TipificacaoInvalidaError(`${onde}: sub-regra não encontrada.`);
    const todos = l.modoMedico === 'todos';
    const medicos = todos ? [] : unicos(l.medicos);
    const equipes = todos ? [] : unicos(l.equipes);
    if (!todos && !medicos.length && !equipes.length)
      throw new TipificacaoInvalidaError(`${onde}: escolha os médicos ou equipes do filtro.`);
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
