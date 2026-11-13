import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { papeis, usuarios } from '../../database/schema';
import type { PapeisSistemaRepository } from './papeis-sistema.repository';

const ADMINISTRADOR = 'Administrador';
const MEDICO = 'Médico';

@Injectable()
export class DrizzlePapeisSistemaRepository implements PapeisSistemaRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async garantir() {
    await this.db
      .insert(papeis)
      .values([
        { nome: ADMINISTRADOR, descricao: 'Acesso total ao One', sistema: true, acessoTotal: true },
        {
          nome: MEDICO,
          descricao: 'Portal do médico: repasse, escala e qualidade próprios',
          sistema: true,
        },
      ])
      .onConflictDoNothing({ target: papeis.nome });
    const [admin] = await this.db
      .select({ id: papeis.id })
      .from(papeis)
      .where(eq(papeis.nome, ADMINISTRADOR));
    if (!admin) throw new Error('papel Administrador não foi criado');
    return { administradorId: admin.id };
  }

  async existeAdministrador() {
    const [linha] = await this.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .innerJoin(papeis, eq(papeis.id, usuarios.papelId))
      .where(eq(papeis.acessoTotal, true))
      .limit(1);
    return !!linha;
  }
}
