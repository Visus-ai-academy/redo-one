import { eq, sql } from 'drizzle-orm';

import type { Database } from '../../database/database';
import { subespecialidades, subespecialidadesEspecialidades } from '../../database/schema';
import { DrizzleListaRepository } from '../listas/drizzle-lista.repository';
import type { DadosSubespecialidade } from '../listas/lista.repository';

const especialidadeIds = sql<string[]>`coalesce((
  select array_agg(${subespecialidadesEspecialidades.especialidadeId}::text order by ${subespecialidadesEspecialidades.especialidadeId})
  from ${subespecialidadesEspecialidades}
  where ${subespecialidadesEspecialidades.subespecialidadeId} = ${subespecialidades.id}
), '{}')`;

/** A lista de subespecialidades, com a ligação às especialidades gravada junto. */
export class DrizzleSubespecialidadesRepository extends DrizzleListaRepository<DadosSubespecialidade> {
  constructor(db: Database) {
    super(db, {
      tabela: subespecialidades,
      id: subespecialidades.id,
      chaveNome: 'nome',
      colunas: {
        nome: subespecialidades.nome,
        descricao: subespecialidades.descricao,
        cor: subespecialidades.cor,
        ordem: subespecialidades.ordem,
        ativo: subespecialidades.ativo,
      },
      extras: {},
    });
  }

  protected override get selecao() {
    return { ...super.selecao, especialidadeIds };
  }

  protected override valores({ especialidadeIds: _, ...dados }: DadosSubespecialidade) {
    return super.valores(dados as DadosSubespecialidade);
  }

  override criar(dados: DadosSubespecialidade) {
    return this.db.transaction(async (tx) => {
      const [criada] = await tx
        .insert(subespecialidades)
        .values(this.valores(dados) as typeof subespecialidades.$inferInsert)
        .returning({ id: subespecialidades.id });
      if (!criada) throw new Error('insert não devolveu o id');
      await tx.insert(subespecialidadesEspecialidades).values(
        dados.especialidadeIds.map((especialidadeId) => ({
          subespecialidadeId: criada.id,
          especialidadeId,
        })),
      );
      return criada.id;
    });
  }

  override async atualizar(id: string, dados: DadosSubespecialidade) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(subespecialidades)
        .set(this.valores(dados))
        .where(eq(subespecialidades.id, id));
      await tx
        .delete(subespecialidadesEspecialidades)
        .where(eq(subespecialidadesEspecialidades.subespecialidadeId, id));
      await tx.insert(subespecialidadesEspecialidades).values(
        dados.especialidadeIds.map((especialidadeId) => ({
          subespecialidadeId: id,
          especialidadeId,
        })),
      );
    });
  }
}
