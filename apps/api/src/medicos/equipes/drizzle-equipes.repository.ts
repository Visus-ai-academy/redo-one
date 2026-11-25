import { eq, sql } from 'drizzle-orm';

import { DrizzleListaRepository } from '../../catalogo/listas/drizzle-lista.repository';
import type { Database } from '../../database/database';
import { equipes, equipesMembros } from '../../database/schema';
import type { DadosEquipe } from './equipes.repository';
import type { EquipesAlteradas } from './equipes-alteradas';

const medicoIds = sql<string[]>`coalesce((
  select array_agg(${equipesMembros.medicoId}::text order by ${equipesMembros.medicoId})
  from ${equipesMembros}
  where ${equipesMembros.equipeId} = ${equipes.id}
), '{}')`;

type Transacao = Parameters<Parameters<Database['transaction']>[0]>[0];

/** As equipes, com os membros gravados junto. */
export class DrizzleEquipesRepository extends DrizzleListaRepository<DadosEquipe> {
  constructor(
    db: Database,
    private readonly alteradas: EquipesAlteradas,
  ) {
    super(db, {
      tabela: equipes,
      id: equipes.id,
      chaveNome: 'nome',
      colunas: {
        nome: equipes.nome,
        descricao: equipes.descricao,
        cor: equipes.cor,
        ordem: equipes.ordem,
        ativo: equipes.ativo,
      },
      extras: { plantao: equipes.plantao },
    });
  }

  protected override get selecao() {
    return { ...super.selecao, medicoIds };
  }

  protected override valores({ medicoIds: _, ...dados }: DadosEquipe) {
    return super.valores(dados as DadosEquipe);
  }

  override criar(dados: DadosEquipe) {
    return this.db.transaction(async (tx) => {
      const [criada] = await tx
        .insert(equipes)
        .values(this.valores(dados) as typeof equipes.$inferInsert)
        .returning({ id: equipes.id });
      if (!criada) throw new Error('insert não devolveu o id');
      await gravarMembros(tx, criada.id, dados.medicoIds);
      return criada.id;
    });
  }

  override async atualizar(id: string, dados: DadosEquipe) {
    await this.db.transaction(async (tx) => {
      await tx.update(equipes).set(this.valores(dados)).where(eq(equipes.id, id));
      await tx.delete(equipesMembros).where(eq(equipesMembros.equipeId, id));
      await gravarMembros(tx, id, dados.medicoIds);
      await this.alteradas.aoAlterar(tx);
    });
  }
}

async function gravarMembros(tx: Transacao, equipeId: string, ids: string[]) {
  if (!ids.length) return;
  await tx.insert(equipesMembros).values(ids.map((medicoId) => ({ equipeId, medicoId })));
}
