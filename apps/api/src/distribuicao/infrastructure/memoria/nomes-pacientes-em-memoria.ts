import type { NomesPacientesRodada } from '../../application/ports/nomes-pacientes-rodada';

/** Quanto os nomes duram sem nova gravação: cobre a conferência e a execução de uma rodada. */
export const VALIDADE_NOMES_PACIENTES_MS = 4 * 3_600_000;

/**
 * Os nomes dos pacientes da rodada num `Map` do processo. LGPD: dado pessoal só em memória, nunca
 * gravado nem logado; some ao limpar, ao vencer o prazo ou ao reiniciar a API.
 */
export class NomesPacientesEmMemoria implements NomesPacientesRodada {
  private readonly porRodada = new Map<string, { ate: number; nomes: Map<string, string> }>();

  constructor(private readonly validadeMs = VALIDADE_NOMES_PACIENTES_MS) {}

  guardar(rodadaId: string, nomes: ReadonlyMap<string, string>, agora: Date): void {
    this.varrer(agora);
    const atual = this.porRodada.get(rodadaId)?.nomes ?? new Map<string, string>();
    for (const [id, nome] of nomes) atual.set(id, nome);
    this.porRodada.set(rodadaId, { ate: agora.getTime() + this.validadeMs, nomes: atual });
  }

  ler(rodadaId: string, agora: Date): ReadonlyMap<string, string> {
    this.varrer(agora);
    return new Map(this.porRodada.get(rodadaId)?.nomes ?? []);
  }

  limpar(rodadaId: string): void {
    this.porRodada.delete(rodadaId);
  }

  /** Só para os testes: as rodadas ainda em memória. */
  rodadasGuardadas(): string[] {
    return [...this.porRodada.keys()];
  }

  private varrer(agora: Date) {
    for (const [id, { ate }] of this.porRodada) {
      if (agora.getTime() >= ate) this.porRodada.delete(id);
    }
  }
}
