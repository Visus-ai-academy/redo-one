export const PACIENTES_LAUDOS = Symbol('PACIENTES_LAUDOS');

/** Nome e código do paciente como chegaram da MobileMed. */
export interface PacienteDoLaudoLido {
  nome: string | null; // LGPD: saúde
  codigo: string | null; // LGPD: saúde
}

/**
 * Leitura de `laudos_pacientes`. Só o caso de uso `LerPacientesDosLaudos` usa esta porta: ele
 * confere a permissão e audita cada leitura.
 */
export interface PacientesLaudos {
  /** Por id do laudo; o laudo sem paciente gravado fica fora do mapa. */
  porLaudos(laudoIds: string[]): Promise<Map<string, PacienteDoLaudoLido>>;
}
