import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type Database } from '../database/database';
import { eventosAuditoria } from '../database/schema';
import type { Auditoria, EventoAuditoria } from './auditoria';

@Injectable()
export class DrizzleAuditoria implements Auditoria {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async registrar(evento: EventoAuditoria) {
    await this.db.insert(eventosAuditoria).values({
      ocorridoEm: evento.em,
      atorTipo: evento.ator.tipo,
      atorId: evento.ator.id ?? null,
      entidade: evento.entidade,
      entidadeId: evento.entidadeId,
      acao: evento.acao,
      antes: evento.antes ?? null,
      depois: evento.depois ?? null,
    });
  }
}
