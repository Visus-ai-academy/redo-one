/** O mínimo de uma ocorrência que a detecção de conflito lê. */
export interface OcorrenciaComIntervalo {
  alocacaoId: string;
  medicoId: string;
  turnoId: string;
  /** Instantes ISO com offset. */
  inicio: string;
  fim: string;
  ausente: boolean;
}

export interface ConflitoDeHorario<T extends OcorrenciaComIntervalo> {
  medicoId: string;
  /** `a` começa antes de (ou junto com) `b`. */
  a: T;
  b: T;
}

/**
 * Pares de ocorrências do mesmo médico no mesmo turno com intervalos [inicio, fim) sobrepostos,
 * para a tela avisar (sobreposição não bloqueia o cadastro). Turnos diferentes no mesmo horário
 * (ex.: Tarde dentro da Lista de 24 h) são trabalhos paralelos, não conflito. Ocorrência ausente
 * (coberta ou com ausência) fica de fora: o médico não está naquele plantão.
 */
export function conflitosDoMedico<T extends OcorrenciaComIntervalo>(
  ocorrencias: readonly T[],
): ConflitoDeHorario<T>[] {
  const comTempo = ocorrencias
    .filter((o) => !o.ausente)
    .map((o) => ({ o, inicio: Date.parse(o.inicio), fim: Date.parse(o.fim) }))
    .sort((x, y) => x.o.medicoId.localeCompare(y.o.medicoId) || x.inicio - y.inicio);

  const conflitos: ConflitoDeHorario<T>[] = [];
  let abertos: typeof comTempo = [];
  let medicoAtual: string | null = null;
  for (const atual of comTempo) {
    if (atual.o.medicoId !== medicoAtual) {
      medicoAtual = atual.o.medicoId;
      abertos = [];
    }
    abertos = abertos.filter((aberto) => aberto.fim > atual.inicio);
    for (const aberto of abertos) {
      if (aberto.o.turnoId !== atual.o.turnoId) continue;
      conflitos.push({ medicoId: atual.o.medicoId, a: aberto.o, b: atual.o });
    }
    abertos.push(atual);
  }
  return conflitos;
}
