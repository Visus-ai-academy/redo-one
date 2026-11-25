/** Dimensão em que se soma o volume do mês que escolhe a faixa (ver `cond_volume`). */
export type CondVolume = 'MOD' | 'MOD_ESP' | 'MOD_ESP_CAT' | 'TOTAL';

/** O que identifica o preço de um laudo: modalidade, especialidade, categoria e prioridade. */
export interface Arranjo {
  modalidadeId: string;
  especialidadeId: string;
  categoriaId: string;
  prioridadeId: string;
}

/** Uma versão de preço de uma tabela (do cliente, da unidade ou padrão do contratado). */
export interface LinhaPreco extends Arranjo {
  id: string;
  /** Faixa de volume do mês; vazia = qualquer volume. */
  faixaInicio: number | null;
  faixaFim: number | null;
  condVolume: CondVolume;
  valor: number;
  /** "YYYY-MM" inclusivos; vazio = sem limite. */
  vigenciaDesde: string | null;
  vigenciaAte: string | null;
}

export type OrigemPreco = 'unidade' | 'principal' | 'padrao';

/** Como o preço foi achado: arranjo e faixa exatos, pela prioridade alternativa ou pela menor faixa. */
export type ComoAchou = 'exato' | 'prioridade_alternativa' | 'menor_faixa';

export type ResultadoPreco =
  | { encontrado: true; valor: number; linhaId: string; origem: OrigemPreco; como: ComoAchou }
  /** Nenhuma tabela tem o arranjo: vai para "preços não cadastrados", nunca sai a R$ 0. */
  | { encontrado: false };

export interface PedidoPreco {
  arranjo: Arranjo;
  /** Competência do laudo ("YYYY-MM"): só valem as versões vigentes nela. */
  competencia: string;
  /** Na ordem em que se procura: unidade (se o laudo é de uma), principal, padrão do contratado. */
  tabelas: { origem: OrigemPreco; linhas: readonly LinhaPreco[] }[];
  /** Prioridade que se tenta quando a do laudo não tem o arranjo (no dashboards-one, PLANTÃO ↔ URGÊNCIA). */
  alternativas: ReadonlyMap<string, string>;
  /** Volume do mês do cliente do laudo na dimensão pedida (ver `volumeDaFaixa`). */
  volume: (cond: CondVolume) => number;
}

/** A versão vale na competência (desde e até inclusivos). */
export const vigenteEm = (
  v: { vigenciaDesde: string | null; vigenciaAte: string | null },
  competencia: string,
) =>
  (v.vigenciaDesde === null || v.vigenciaDesde <= competencia) &&
  (v.vigenciaAte === null || v.vigenciaAte >= competencia);

const mesmoArranjo = (l: LinhaPreco, a: Arranjo, prioridadeId: string) =>
  l.modalidadeId === a.modalidadeId &&
  l.especialidadeId === a.especialidadeId &&
  l.categoriaId === a.categoriaId &&
  l.prioridadeId === prioridadeId;

const contem = (l: LinhaPreco, volume: number) =>
  (l.faixaInicio === null || volume >= l.faixaInicio) &&
  (l.faixaFim === null || volume <= l.faixaFim);

/** Início da faixa para ordenar: sem faixa conta como a menor (antes de 0). */
const inicio = (l: LinhaPreco) => l.faixaInicio ?? -1;

/**
 * Preço unitário do laudo. Em cada tabela, na ordem (unidade → principal → padrão): o arranjo com
 * a faixa que contém o volume (a de maior início, se várias); sem ele, o mesmo na prioridade
 * alternativa; sem ele, a menor faixa do arranjo (prioridade exata antes da alternativa), como o
 * "último recurso" do dashboards-one. Sem nada em nenhuma tabela, "sem preço".
 */
export function buscarPreco(pedido: PedidoPreco): ResultadoPreco {
  const { arranjo, competencia, alternativas, volume } = pedido;
  const alternativa = alternativas.get(arranjo.prioridadeId) ?? null;
  const volumes = new Map<CondVolume, number>();
  const volumeDe = (c: CondVolume) => {
    if (!volumes.has(c)) volumes.set(c, volume(c));
    return volumes.get(c) as number;
  };

  for (const { origem, linhas } of pedido.tabelas) {
    const vigentes = linhas.filter((l) => vigenteEm(l, competencia));
    const naFaixa = (prioridadeId: string) =>
      vigentes
        .filter((l) => mesmoArranjo(l, arranjo, prioridadeId) && contem(l, volumeDe(l.condVolume)))
        .sort((a, b) => inicio(b) - inicio(a))[0];
    const achou = (l: LinhaPreco, como: ComoAchou): ResultadoPreco => ({
      encontrado: true,
      valor: l.valor,
      linhaId: l.id,
      origem,
      como,
    });

    const exata = naFaixa(arranjo.prioridadeId);
    if (exata) return achou(exata, 'exato');
    const alt = alternativa ? naFaixa(alternativa) : undefined;
    if (alt) return achou(alt, 'prioridade_alternativa');
    const menor = vigentes
      .filter(
        (l) =>
          mesmoArranjo(l, arranjo, arranjo.prioridadeId) ||
          (alternativa !== null && mesmoArranjo(l, arranjo, alternativa)),
      )
      .sort(
        (a, b) =>
          Number(a.prioridadeId !== arranjo.prioridadeId) -
            Number(b.prioridadeId !== arranjo.prioridadeId) || inicio(a) - inicio(b),
      )[0];
    if (menor) return achou(menor, 'menor_faixa');
  }
  return { encontrado: false };
}

/** O que o volume da faixa lê de cada laudo do cliente na competência (sem filtrar a tipificação). */
export interface LaudoParaVolume {
  modalidadeId: string | null;
  especialidadeId: string | null;
  categoriaId: string | null;
  volume: number;
}

/**
 * Volume do mês do cliente (ou da unidade) na dimensão do `condVolume`, como o dashboards-one o
 * soma: todos os laudos da competência, sem filtrar a tipificação, cada um arredondado, e nunca
 * menos que 1 (a faixa que começa em 1 casa mesmo sem laudos).
 */
export function volumeDaFaixa(
  laudos: readonly LaudoParaVolume[],
): (cond: CondVolume, arranjo: Omit<Arranjo, 'prioridadeId'>) => number {
  const somas = new Map<string, number>();
  const somar = (chave: string, v: number) => somas.set(chave, (somas.get(chave) ?? 0) + v);
  for (const l of laudos) {
    const v = Math.round(l.volume);
    somar('TOTAL', v);
    somar(`MOD|${l.modalidadeId}`, v);
    somar(`MOD_ESP|${l.modalidadeId}|${l.especialidadeId}`, v);
    somar(`MOD_ESP_CAT|${l.modalidadeId}|${l.especialidadeId}|${l.categoriaId}`, v);
  }
  return (cond, a) => {
    const chave =
      cond === 'TOTAL'
        ? 'TOTAL'
        : cond === 'MOD'
          ? `MOD|${a.modalidadeId}`
          : cond === 'MOD_ESP'
            ? `MOD_ESP|${a.modalidadeId}|${a.especialidadeId}`
            : `MOD_ESP_CAT|${a.modalidadeId}|${a.especialidadeId}|${a.categoriaId}`;
    return Math.max(1, somas.get(chave) ?? 0);
  };
}
