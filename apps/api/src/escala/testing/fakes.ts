import type { EscopoEscala, EscopoEscalaRepository, RecorteEscala } from '../escopo/escopo';

/**
 * Recorte da gestora em memória. Usuário sem registro aqui vê toda a escala (como quem tem
 * "vê toda a escala" no banco); com registro sem "vê toda a escala", só o recorte (vazio = nada).
 */
export class FakeEscopoEscalaRepository implements EscopoEscalaRepository {
  readonly escopos = new Map<string, RecorteEscala>();

  async doUsuario(usuarioId: string): Promise<EscopoEscala | null> {
    const escopo = this.escopos.get(usuarioId);
    if (!escopo || escopo.veTodaEscala) return null;
    return { turnoIds: new Set(escopo.turnoIds), frenteIds: new Set(escopo.frenteIds) };
  }

  /** Sem `veTodaEscala`, ele vem das listas: vazias = "vê toda a escala" (atalho dos testes). */
  async definir(
    usuarioId: string,
    escopo: { veTodaEscala?: boolean; turnoIds: string[]; frenteIds: string[] },
  ): Promise<void> {
    this.escopos.set(usuarioId, {
      veTodaEscala: escopo.veTodaEscala ?? (!escopo.turnoIds.length && !escopo.frenteIds.length),
      turnoIds: [...new Set(escopo.turnoIds)],
      frenteIds: [...new Set(escopo.frenteIds)],
    });
  }
}
