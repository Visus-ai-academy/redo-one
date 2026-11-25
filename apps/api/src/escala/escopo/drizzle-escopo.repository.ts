import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { usuarios, usuariosEscoposEscala } from '../../database/schema';
import type { EscopoEscala, EscopoEscalaRepository, RecorteEscala } from './escopo';

/** O recorte da gestora: uma linha por turno ou frente liberado. */
@Injectable()
export class DrizzleEscopoEscalaRepository implements EscopoEscalaRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async doUsuario(usuarioId: string): Promise<EscopoEscala | null> {
    const [usuario] = await this.db
      .select({ veTodaEscala: usuarios.veTodaEscala })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);
    if (usuario?.veTodaEscala) return null;
    const linhas = await this.db
      .select({ turnoId: usuariosEscoposEscala.turnoId, frenteId: usuariosEscoposEscala.frenteId })
      .from(usuariosEscoposEscala)
      .where(eq(usuariosEscoposEscala.usuarioId, usuarioId));

    const turnoIds = new Set<string>();
    const frenteIds = new Set<string>();
    for (const linha of linhas) {
      if (linha.turnoId) turnoIds.add(linha.turnoId);
      if (linha.frenteId) frenteIds.add(linha.frenteId);
    }
    return { turnoIds, frenteIds };
  }

  async definir(usuarioId: string, escopo: RecorteEscala): Promise<void> {
    await this.db.transaction((tx) => gravarRecorteEscala(tx, usuarioId, escopo));
  }
}

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Troca o "vê toda a escala" e as linhas do recorte, dentro da transação de quem chama. */
export async function gravarRecorteEscala(tx: Transacao, usuarioId: string, escopo: RecorteEscala) {
  const linhas = escopo.veTodaEscala
    ? []
    : [
        ...[...new Set(escopo.turnoIds)].map((turnoId) => ({ usuarioId, turnoId })),
        ...[...new Set(escopo.frenteIds)].map((frenteId) => ({ usuarioId, frenteId })),
      ];
  await tx
    .update(usuarios)
    .set({ veTodaEscala: escopo.veTodaEscala })
    .where(eq(usuarios.id, usuarioId));
  await tx.delete(usuariosEscoposEscala).where(eq(usuariosEscoposEscala.usuarioId, usuarioId));
  if (linhas.length > 0) await tx.insert(usuariosEscoposEscala).values(linhas);
}
