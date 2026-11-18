import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type Database } from '../../../database/database';
import { DrizzleEscopoEscalaRepository } from '../../../escala/escopo/drizzle-escopo.repository';
import type { EscopoDoAtor, EscopoRodada } from '../../application/ports/insumos-rodada';

/** O recorte da gestora de escala (`usuarios_escopos_escala`), lido pelo repositório da escala. */
@Injectable()
export class EscopoRodadaAdapter implements EscopoRodada {
  private readonly escopos: DrizzleEscopoEscalaRepository;

  constructor(@Inject(DATABASE) db: Database) {
    this.escopos = new DrizzleEscopoEscalaRepository(db);
  }

  doUsuario(usuarioId: string): Promise<EscopoDoAtor | null> {
    return this.escopos.doUsuario(usuarioId);
  }
}
