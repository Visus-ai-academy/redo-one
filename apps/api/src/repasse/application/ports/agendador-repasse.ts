export const AGENDADOR_REPASSE = Symbol('AGENDADOR_REPASSE');

/** Pede o cálculo de novo (job), depois de mudar algo que decide o repasse. */
export interface AgendadorRepasse {
  /** A prévia de uma competência aberta. */
  previa(competencia: string): Promise<void>;
  /** As prévias de todas as competências abertas (mudou a configuração). */
  previas(): Promise<void>;
}
