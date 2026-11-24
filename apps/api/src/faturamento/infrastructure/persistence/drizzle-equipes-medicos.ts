import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, inArray } from 'drizzle-orm';

import { contem, relevancia } from '../../../database/busca';
import { DATABASE, type Database } from '../../../database/database';
import { equipes, equipesMembros, medicos } from '../../../database/schema';
import type { EquipesMedicos } from '../../application/ports/equipes-medicos';

/** Leitura das equipes e médicos (do contexto `medicos`) para a tipificação. */
@Injectable()
export class DrizzleEquipesMedicos implements EquipesMedicos {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async membros() {
    const linhas = await this.db
      .select({ equipeId: equipesMembros.equipeId, medicoId: equipesMembros.medicoId })
      .from(equipesMembros);
    const porEquipe = new Map<string, string[]>();
    for (const l of linhas)
      porEquipe.set(l.equipeId, [...(porEquipe.get(l.equipeId) ?? []), l.medicoId]);
    return [...porEquipe].map(([id, lista]) => ({ id, medicos: lista }));
  }

  listarEquipes() {
    return this.db
      .select({ id: equipes.id, nome: equipes.nome, cor: equipes.cor })
      .from(equipes)
      .where(eq(equipes.ativo, true))
      .orderBy(asc(equipes.ordem), asc(equipes.nome));
  }

  buscarMedicos(busca: string, limite: number) {
    return this.db
      .select({ id: medicos.id, nome: medicos.nome })
      .from(medicos)
      .where(and(eq(medicos.ativo, true), busca ? ilike(medicos.nome, contem(busca)) : undefined))
      .orderBy(...(busca ? relevancia(medicos.nome, busca) : []), asc(medicos.nome))
      .limit(limite);
  }

  async nomesMedicos(ids: string[]) {
    if (!ids.length) return [];
    return this.db
      .select({ id: medicos.id, nome: medicos.nome })
      .from(medicos)
      .where(inArray(medicos.id, ids));
  }
}
