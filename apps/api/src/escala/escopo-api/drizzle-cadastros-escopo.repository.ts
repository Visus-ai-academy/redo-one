import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import {
  especialidades,
  frentesEscala,
  modalidades,
  turnos,
  usuarios,
} from '../../database/schema';
import { frenteDoCatalogo, ordemDasFrentes } from '../frentes/frente-do-catalogo';
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
      .select({ id: frentesEscala.id, nome: frenteDoCatalogo.rotulo })
      .from(frentesEscala)
      .leftJoin(especialidades, eq(especialidades.id, frentesEscala.especialidadeId))
      .leftJoin(modalidades, eq(modalidades.id, frentesEscala.modalidadeId))
      .where(inArray(frentesEscala.id, ids))
      .orderBy(...ordemDasFrentes);
  }
}
