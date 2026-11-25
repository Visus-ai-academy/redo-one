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

/** O recorte como se grava: "vê toda a escala" explícito, ou os turnos e as frentes. */
export interface RecorteEscala {
  veTodaEscala: boolean;
  turnoIds: string[];
  frenteIds: string[];
}

export interface EscopoEscalaRepository {
  /**
   * Com "vê toda a escala", `null` (sem recorte). Sem ele, o recorte; sem turno nem frente, um
   * recorte vazio (não vê nada): vazio nunca é "toda a escala".
   */
  doUsuario(usuarioId: string): Promise<EscopoEscala | null>;
  /** Troca o recorte inteiro. */
  definir(usuarioId: string, escopo: RecorteEscala): Promise<void>;
}
