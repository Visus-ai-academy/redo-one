import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { usuariosEscoposEscala } from '../../database/schema';
import type { EscopoEscala, EscopoEscalaRepository } from './escopo';

/** O recorte da gestora: uma linha por turno ou frente liberado. */
@Injectable()
export class DrizzleEscopoEscalaRepository implements EscopoEscalaRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async doUsuario(usuarioId: string): Promise<EscopoEscala | null> {
    const linhas = await this.db
      .select({ turnoId: usuariosEscoposEscala.turnoId, frenteId: usuariosEscoposEscala.frenteId })
      .from(usuariosEscoposEscala)
      .where(eq(usuariosEscoposEscala.usuarioId, usuarioId));
    if (linhas.length === 0) return null;

    const turnoIds = new Set<string>();
    const frenteIds = new Set<string>();
    for (const linha of linhas) {
      if (linha.turnoId) turnoIds.add(linha.turnoId);
      if (linha.frenteId) frenteIds.add(linha.frenteId);
    }
    return { turnoIds, frenteIds };
  }

  async definir(
    usuarioId: string,
    escopo: { turnoIds: string[]; frenteIds: string[] },
  ): Promise<void> {
    const linhas = [
      ...[...new Set(escopo.turnoIds)].map((turnoId) => ({ usuarioId, turnoId })),
      ...[...new Set(escopo.frenteIds)].map((frenteId) => ({ usuarioId, frenteId })),
    ];
    await this.db.transaction(async (tx) => {
      await tx.delete(usuariosEscoposEscala).where(eq(usuariosEscoposEscala.usuarioId, usuarioId));
      if (linhas.length > 0) await tx.insert(usuariosEscoposEscala).values(linhas);
    });
  }
}
