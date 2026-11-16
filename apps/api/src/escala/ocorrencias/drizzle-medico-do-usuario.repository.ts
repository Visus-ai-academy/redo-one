import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { usuarios } from '../../database/schema';
import type { MedicoDoUsuarioRepository } from './medico-do-usuario.repository';

@Injectable()
export class DrizzleMedicoDoUsuarioRepository implements MedicoDoUsuarioRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async doUsuario(usuarioId: string): Promise<string | null> {
    const [linha] = await this.db
      .select({ medicoId: usuarios.medicoId })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);
    return linha?.medicoId ?? null;
  }
}
