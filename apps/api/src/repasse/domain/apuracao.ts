import type { ExtraRegra, LaudoRepasse } from './demonstrativo';

export type TipoRegraApuracao = 'fixo' | 'por_laudo' | 'percentual_repasse' | 'tarifa_laudo';

/** Regra de apuração vigente do médico; `null` num recorte = todos. */
export interface RegraApuracaoVigente {
  id: string;
  medicoId: string;
  tipo: TipoRegraApuracao;
  descricao: string;
  /** `fixo`, `por_laudo` e `tarifa_laudo`. */
  valorCentavos: number | null;
  /** `percentual_repasse`, em partes por milhão. */
  percentualPpm: number | null;
  divisor: number;
  modalidadeIds: readonly string[] | null;
  especialidadeIds: readonly string[] | null;
  prioridadeIds: readonly string[] | null;
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const reais = (centavos: number) => moeda.format(centavos / 100).replace(/ /g, ' ');
const casa = (lista: readonly string[] | null, valor: string | null) =>
  lista === null || (valor !== null && lista.includes(valor));

/** Tarifa própria de cada médico (substitui os preços dele). */
export function tarifasDasRegras(regras: readonly RegraApuracaoVigente[]): Map<string, number> {
  const t = new Map<string, number>();
  for (const r of regras)
    if (r.tipo === 'tarifa_laudo' && r.valorCentavos !== null && !t.has(r.medicoId))
      t.set(r.medicoId, r.valorCentavos);
  return t;
}

/**
 * Extras da competência por médico (coordenação fixa, por laudo da operação e percentual do repasse
 * de uma especialidade), com a memória de cálculo na descrição. `laudos` é a operação inteira
 * (reclassificada, com ou sem médico); `examesPorMedico` já traz o valor de exames de todos.
 */
export function calcularExtras(entrada: {
  regras: readonly RegraApuracaoVigente[];
  laudos: readonly LaudoRepasse[];
  /** Especialidades que cada médico lauda (arranjos da distribuição). */
  especialidadesDoMedico: ReadonlyMap<string, ReadonlySet<string>>;
  examesPorMedico: ReadonlyMap<string, number>;
}): Map<string, ExtraRegra[]> {
  const out = new Map<string, ExtraRegra[]>();
  for (const r of entrada.regras) {
    const div = Math.max(1, r.divisor);
    const sufixo = div > 1 ? ` ÷ ${div}` : '';
    let valor: number;
    let memoria: string;
    if (r.tipo === 'fixo') {
      valor = (r.valorCentavos ?? 0) / div;
      memoria = div > 1 ? `${reais(r.valorCentavos ?? 0)}${sufixo}` : '';
    } else if (r.tipo === 'por_laudo') {
      const volume = entrada.laudos
        .filter(
          (l) =>
            casa(r.modalidadeIds, l.modalidadeId) &&
            casa(r.especialidadeIds, l.especialidadeId) &&
            casa(r.prioridadeIds, l.prioridadeId),
        )
        .reduce((s, l) => s + l.volume, 0);
      valor = (volume * (r.valorCentavos ?? 0)) / div;
      memoria = `${inteiro.format(volume)} laudos × ${reais(r.valorCentavos ?? 0)}${sufixo}`;
    } else if (r.tipo === 'percentual_repasse') {
      let base = 0;
      for (const [medicoId, exames] of entrada.examesPorMedico) {
        const esp = entrada.especialidadesDoMedico.get(medicoId);
        if (r.especialidadeIds === null || r.especialidadeIds.some((e) => esp?.has(e)))
          base += exames;
      }
      valor = (base * (r.percentualPpm ?? 0)) / 1_000_000 / div;
      const pct = inteiro.format((r.percentualPpm ?? 0) / 10_000);
      memoria = `${pct}% de ${reais(base)}${sufixo}`;
    } else continue;

    const valorCentavos = Math.round(valor);
    if (valorCentavos === 0) continue;
    out.set(r.medicoId, [
      ...(out.get(r.medicoId) ?? []),
      {
        regraId: r.id,
        valorCentavos,
        descricao: memoria ? `${r.descricao} (${memoria})` : r.descricao,
      },
    ]);
  }
  return out;
}
