/** Tipificação de um laudo do dashboards-one, com os critérios crus que ela casou. */
export interface LaudoLegadoTipificado {
  regra: string | null;
  sub: string | null;
  especialidade: string | null;
  prioridade: string | null;
  medico: string | null;
}

/** Tipificação de um laudo do redo-one, com os critérios resolvidos. */
export interface LaudoRedoTipificado {
  identidade: string;
  regra: string | null;
  sub: string | null;
  cliente: string | null;
  especialidade: string | null;
  prioridade: string | null;
  medico: string | null;
  volume: number;
}

export interface GrupoDivergencia {
  cliente: string | null;
  legado: string | null;
  redo: string | null;
  /** "cru → resolvido". */
  especialidade: string;
  prioridade: string;
  laudos: number;
  volume: number;
}

export interface ResultadoParidade {
  total: number;
  iguais: number;
  /** Laudos do redo-one sem o mesmo laudo (chave natural) no dashboards-one. */
  semPar: number;
  divergentes: number;
  /** Por cliente, tipificação de lá e daqui e critério cru → resolvido; o maior grupo primeiro. */
  grupos: GrupoDivergencia[];
}

const rotulo = (regra: string | null, sub: string | null) => sub ?? regra;

/**
 * Compara a tipificação de cada laudo do redo-one com a do mesmo laudo no dashboards-one (pela
 * identidade, a chave natural). As divergências saem agrupadas pelo que costuma explicá-las: o
 * critério cru do dashboards-one × o resolvido do redo-one (COLUNAS → MUSCULO ESQUELETICO).
 */
export function compararTipificacoes(
  novos: LaudoRedoTipificado[],
  antigos: ReadonlyMap<string, LaudoLegadoTipificado>,
): ResultadoParidade {
  const r: ResultadoParidade = {
    total: novos.length,
    iguais: 0,
    semPar: 0,
    divergentes: 0,
    grupos: [],
  };
  const grupos = new Map<string, GrupoDivergencia>();
  for (const n of novos) {
    const a = antigos.get(n.identidade);
    if (!a) {
      r.semPar++;
      continue;
    }
    if (n.regra === a.regra && (n.sub ?? null) === (a.sub ?? null)) {
      r.iguais++;
      continue;
    }
    r.divergentes++;
    const g: GrupoDivergencia = {
      cliente: n.cliente,
      legado: rotulo(a.regra, a.sub),
      redo: rotulo(n.regra, n.sub),
      especialidade: `${a.especialidade ?? '-'} → ${n.especialidade ?? '-'}`,
      prioridade: `${a.prioridade ?? '-'} → ${n.prioridade ?? '-'}`,
      laudos: 0,
      volume: 0,
    };
    const k = JSON.stringify([g.cliente, g.legado, g.redo, g.especialidade, g.prioridade]);
    const atual = grupos.get(k) ?? g;
    atual.laudos += 1;
    atual.volume += n.volume;
    grupos.set(k, atual);
  }
  r.grupos = [...grupos.values()].sort((x, y) => y.laudos - x.laudos);
  return r;
}
