/** Recorte da gestora de escala: turnos OU frentes. `null` = sem recorte. */
export interface EscopoEscala {
  turnoIds: ReadonlySet<string>;
  frenteIds: ReadonlySet<string>;
}

/** O alvo (alocação, ausência, célula da grade) está no recorte se o turno OU a frente estiver. */
export function estaNoEscopo(
  escopo: EscopoEscala | null,
  alvo: { turnoId: string; frenteId: string },
): boolean {
  if (!escopo) return true;
  return escopo.turnoIds.has(alvo.turnoId) || escopo.frenteIds.has(alvo.frenteId);
}

/**
 * Frentes liberadas pelo recorte, na ordem de `todasFrenteIds`. Sem recorte, todas. Com recorte,
 * só as frentes listadas nele (que existam em `todasFrenteIds`): um turno do recorte NÃO libera as
 * frentes dele aqui; para saber se uma célula turno × frente vale, use `estaNoEscopo`.
 */
export function frentesPermitidas(escopo: EscopoEscala | null, todasFrenteIds: string[]): string[] {
  if (!escopo) return [...todasFrenteIds];
  return todasFrenteIds.filter((id) => escopo.frenteIds.has(id));
}

export const ESCOPO_ESCALA_REPOSITORY = Symbol('ESCOPO_ESCALA_REPOSITORY');

export interface EscopoEscalaRepository {
  /** Sem linhas = `null` (sem recorte). */
  doUsuario(usuarioId: string): Promise<EscopoEscala | null>;
  /** Troca o recorte inteiro; listas vazias apagam o recorte (volta a ser sem recorte). */
  definir(usuarioId: string, escopo: { turnoIds: string[]; frenteIds: string[] }): Promise<void>;
}
