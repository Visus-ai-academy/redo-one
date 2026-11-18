import { inArray } from 'drizzle-orm';
import { especialidadeIds } from '../catalogo/subespecialidades/drizzle-subespecialidades.repository';
import type { Segmento } from '../comum/segmentos';
import type { Database } from './database';
import { subespecialidades } from './schema';

/** Os segmentos pedidos, com as especialidades em que existem (para os repositórios). */
export async function lerSegmentos(db: Database, ids: readonly string[]): Promise<Segmento[]> {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return [];
  return db
    .select({ id: subespecialidades.id, nome: subespecialidades.nome, especialidadeIds })
    .from(subespecialidades)
    .where(inArray(subespecialidades.id, unicos));
}
