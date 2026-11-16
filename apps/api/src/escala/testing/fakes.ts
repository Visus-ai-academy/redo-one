import type { EscopoEscala, EscopoEscalaRepository } from '../escopo/escopo';

/** Recorte da gestora em memória. Listas vazias = sem recorte, como no banco. */
export class FakeEscopoEscalaRepository implements EscopoEscalaRepository {
  readonly escopos = new Map<string, { turnoIds: string[]; frenteIds: string[] }>();

  async doUsuario(usuarioId: string): Promise<EscopoEscala | null> {
    const escopo = this.escopos.get(usuarioId);
    if (!escopo || (escopo.turnoIds.length === 0 && escopo.frenteIds.length === 0)) return null;
    return { turnoIds: new Set(escopo.turnoIds), frenteIds: new Set(escopo.frenteIds) };
  }

  async definir(
    usuarioId: string,
    escopo: { turnoIds: string[]; frenteIds: string[] },
  ): Promise<void> {
    this.escopos.set(usuarioId, {
      turnoIds: [...new Set(escopo.turnoIds)],
      frenteIds: [...new Set(escopo.frenteIds)],
    });
  }
}
