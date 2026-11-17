import { Inject, Injectable } from '@nestjs/common';
import { asc } from 'drizzle-orm';

import { especialidadeIds } from '../../catalogo/subespecialidades/drizzle-subespecialidades.repository';
import { DATABASE, type Database } from '../../database/database';
import { prioridades, subespecialidades } from '../../database/schema';
import type { ClassificacoesEscalaRepository } from './classificacoes-escala.repository';

@Injectable()
export class DrizzleClassificacoesEscalaRepository implements ClassificacoesEscalaRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar() {
    const [listaPrioridades, listaSubespecialidades] = await Promise.all([
      this.db
        .select({ id: prioridades.id, nome: prioridades.nome, ativo: prioridades.ativo })
        .from(prioridades)
        .orderBy(asc(prioridades.ordem), asc(prioridades.nome)),
      this.db
        .select({
          id: subespecialidades.id,
          nome: subespecialidades.nome,
          ativo: subespecialidades.ativo,
          especialidadeIds,
        })
        .from(subespecialidades)
        .orderBy(asc(subespecialidades.ordem), asc(subespecialidades.nome)),
    ]);
    return { prioridades: listaPrioridades, subespecialidades: listaSubespecialidades };
  }
}
