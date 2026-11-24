import { Inject, Injectable } from '@nestjs/common';
import { eq, isNotNull, or } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { competencias } from '../../../database/schema';
import type { CompetenciasBloqueadas } from '../../../ingestao/application/ports/competencias-bloqueadas';
import type { CompetenciasRepository } from '../../application/ports/competencias.repository';

/** Também é a porta `CompetenciasBloqueadas` da `ingestao`. */
@Injectable()
export class DrizzleCompetenciasRepository
  implements CompetenciasRepository, CompetenciasBloqueadas
{
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listarBloqueadas(): Promise<string[]> {
    const linhas = await this.db
      .select({ competencia: competencias.competencia })
      .from(competencias)
      .where(or(eq(competencias.status, 'fechada'), isNotNull(competencias.importacaoTravadaEm)));
    return linhas.map((l) => l.competencia);
  }

  listar(): Promise<string[]> {
    return this.listarBloqueadas();
  }

  async garantir(lista: string[]): Promise<void> {
    const unicas = [...new Set(lista)];
    if (unicas.length === 0) return;
    await this.db
      .insert(competencias)
      .values(unicas.map((competencia) => ({ competencia, status: 'aberta' as const })))
      .onConflictDoNothing({ target: competencias.competencia });
  }
}
