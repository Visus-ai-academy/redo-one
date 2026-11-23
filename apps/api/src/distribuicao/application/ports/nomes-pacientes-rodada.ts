export const NOMES_PACIENTES_RODADA = Symbol('NOMES_PACIENTES_RODADA');

/**
 * Os nomes dos pacientes que a leitura da rodada já trouxe da MobileMed, guardados só em memória
 * no processo da API (nunca no banco nem em log), para a conferência mostrá-los sem ler a fila de
 * novo. Chave: id do exame na MobileMed. Some quando a rodada termina ou pelo teto de tempo.
 */
export interface NomesPacientesRodada {
  /** Junta os nomes aos que a rodada já tem e renova o prazo. */
  guardar(rodadaId: string, nomes: ReadonlyMap<string, string>, agora: Date): void;
  /** Os nomes da rodada; vazio se nunca guardados, limpos ou vencidos. */
  ler(rodadaId: string, agora: Date): ReadonlyMap<string, string>;
  limpar(rodadaId: string): void;
}
