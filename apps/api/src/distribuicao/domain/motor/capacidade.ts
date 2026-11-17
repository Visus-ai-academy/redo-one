/**
 * Quanto cabe num médico na rodada. Fonte: dashboards-one `capacidade.ts`. Diferença de propósito:
 * o turno chega com início e fim em INSTANTES (a escala já expande o plantão que vira a meia-noite),
 * em vez de "HH:MM" do dia. O legado, à 00:30, olhava a ocorrência de hoje do plantão noturno — a
 * de ontem, que é a que está em curso, ficava de fora.
 */

export interface TurnoNoInstante {
  inicio: Date;
  fim: Date;
  /** Produtividade da escala (o turno inteiro); null = desconhecida, nunca zero. */
  produtividade: number | null;
}

export interface OpcoesCapacidade {
  /** Com quanta antecedência o turno que ainda não começou entra (configuração global). */
  antecedenciaMin: number;
  /** O turno foi marcado no filtro da rodada: o de hoje entra cheio sem esperar a antecedência. */
  turnoEscolhido: boolean;
}

/**
 * Teto do turno na hora da rodada: encerrado fica de fora; em curso ou começando dentro da
 * antecedência, a produtividade cheia (sem rateio pelo tempo restante, 27/10 no legado).
 */
export function capacidadeNoInstante(
  turno: TurnoNoInstante,
  agora: Date,
  opcoes: OpcoesCapacidade,
): { capacidade: number | null; entra: boolean } {
  const fora = { capacidade: turno.produtividade === null ? null : 0, entra: false };
  const t = agora.getTime();
  if (t >= turno.fim.getTime()) return fora;
  const faltaMin = (turno.inicio.getTime() - t) / 60_000;
  if (faltaMin > opcoes.antecedenciaMin && !opcoes.turnoEscolhido) return fora;
  return { capacidade: turno.produtividade, entra: true };
}

/**
 * Junta um valor (produtividade, capacidade) dos períodos de um médico. Turnos diferentes somam;
 * no mesmo turno (mesmo titular) vale o maior; cada cobertura soma por cima. Null não soma nem zera.
 */
export function juntarPeriodos(
  valores: readonly { coberturaDe?: string | null; turnoId?: string; valor: number | null }[],
): number | null {
  const maior = new Map<string, number>();
  for (const { coberturaDe, turnoId, valor } of valores) {
    if (valor === null) continue;
    const k = `${coberturaDe ?? ''}|${turnoId ?? ''}`;
    maior.set(k, Math.max(maior.get(k) ?? 0, valor));
  }
  return maior.size ? [...maior.values()].reduce((s, v) => s + v, 0) : null;
}
