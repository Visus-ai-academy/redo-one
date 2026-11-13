import { Inject, Injectable } from '@nestjs/common';

import { DATABASE, type Database } from '../../database/database';
import { sessoes } from '../../database/schema';
import type { NovaSessao, SessoesRepository } from './sessoes.repository';

@Injectable()
export class DrizzleSessoesRepository implements SessoesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async criar(sessao: NovaSessao) {
    await this.db.insert(sessoes).values({
      usuarioId: sessao.usuarioId,
      tokenHash: sessao.tokenHash,
      criadoEm: sessao.criadaEm,
      ultimoUsoEm: sessao.criadaEm,
      expiraEm: sessao.expiraEm,
      expiraAbsolutoEm: sessao.expiraAbsolutoEm,
      ip: sessao.ip,
      userAgent: sessao.userAgent,
    });
  }
}
