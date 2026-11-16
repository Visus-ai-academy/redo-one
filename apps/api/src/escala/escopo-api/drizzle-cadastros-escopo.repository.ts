import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { frentesEscala, turnos, usuarios } from '../../database/schema';
import type { CadastrosEscopoRepository, Referencia } from './cadastros-escopo.repository';

@Injectable()
export class DrizzleCadastrosEscopoRepository implements CadastrosEscopoRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async usuarioExiste(id: string): Promise<boolean> {
    const [linha] = await this.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.id, id))
      .limit(1);
    return Boolean(linha);
  }

  async turnos(ids: string[]): Promise<Referencia[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({ id: turnos.id, nome: turnos.nome })
      .from(turnos)
      .where(inArray(turnos.id, ids))
      .orderBy(asc(turnos.ordem), asc(turnos.nome));
  }

  async frentes(ids: string[]): Promise<Referencia[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({ id: frentesEscala.id, nome: frentesEscala.rotulo })
      .from(frentesEscala)
      .where(inArray(frentesEscala.id, ids))
      .orderBy(asc(frentesEscala.ordem), asc(frentesEscala.rotulo));
  }
}
