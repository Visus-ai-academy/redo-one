import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, ilike, or, type SQL } from 'drizzle-orm';

import type { FiltroLista } from '../../catalogo/listas/lista.repository';
import { contem, relevancia } from '../../database/busca';
import { DATABASE, type Database } from '../../database/database';
import { especialidades, frentesEscala, modalidades } from '../../database/schema';
import { frenteDoCatalogo, ordemDasFrentes } from './frente-do-catalogo';
import type { Frente, FrentesRepository } from './frentes.repository';

const selecao = {
  id: frentesEscala.id,
  tipo: frentesEscala.tipo,
  especialidadeId: frentesEscala.especialidadeId,
  modalidadeId: frentesEscala.modalidadeId,
  rotulo: frenteDoCatalogo.rotulo,
  destinoNome: frenteDoCatalogo.rotulo,
  descricao: frenteDoCatalogo.descricao,
  cor: frenteDoCatalogo.cor,
  ordem: frenteDoCatalogo.ordem,
  ativo: frenteDoCatalogo.ativo,
};

/** Frentes da escala lidas do catálogo (a tabela `frentes_escala` só guarda a chave). */
@Injectable()
export class DrizzleFrentesRepository implements FrentesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private consulta() {
    return this.db
      .select(selecao)
      .from(frentesEscala)
      .leftJoin(especialidades, eq(especialidades.id, frentesEscala.especialidadeId))
      .leftJoin(modalidades, eq(modalidades.id, frentesEscala.modalidadeId));
  }

  async listar(filtro: FiltroLista) {
    const condicoes: (SQL | undefined)[] = [];
    if (filtro.busca) {
      const padrao = contem(filtro.busca);
      condicoes.push(
        or(ilike(frenteDoCatalogo.rotulo, padrao), ilike(frenteDoCatalogo.descricao, padrao)),
      );
    }
    if (filtro.ativo !== undefined) condicoes.push(eq(frenteDoCatalogo.ativo, filtro.ativo));
    const onde = and(...condicoes);

    const [itens, [linha]] = await Promise.all([
      this.consulta()
        .where(onde)
        .orderBy(
          ...(filtro.busca ? relevancia(frenteDoCatalogo.rotulo, filtro.busca) : []),
          ...ordemDasFrentes,
        )
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db
        .select({ total: count() })
        .from(frentesEscala)
        .leftJoin(especialidades, eq(especialidades.id, frentesEscala.especialidadeId))
        .leftJoin(modalidades, eq(modalidades.id, frentesEscala.modalidadeId))
        .where(onde),
    ]);
    return { itens: itens as Frente[], total: linha?.total ?? 0 };
  }

  async buscar(id: string) {
    const [frente] = await this.consulta().where(eq(frentesEscala.id, id)).limit(1);
    return (frente as Frente | undefined) ?? null;
  }
}
