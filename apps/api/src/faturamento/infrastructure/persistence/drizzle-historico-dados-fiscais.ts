import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { Pagina, Paginacao } from '../../../catalogo/comum/paginacao';
import { DATABASE, type Database } from '../../../database/database';
import { chavesRobo, eventosAuditoria as e, usuarios } from '../../../database/schema';
import {
  type AlteracaoDadosFiscais,
  ENTIDADE_DADOS_FISCAIS,
  type HistoricoDadosFiscaisRepository,
} from '../../application/ports/historico-dados-fiscais';

type Json = Record<string, unknown> | null;

/** Eventos de auditoria dos dados de faturamento de um cliente (índice entidade + id + data). */
@Injectable()
export class DrizzleHistoricoDadosFiscais implements HistoricoDadosFiscaisRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listar(
    clienteId: string,
    { pagina, porPagina }: Paginacao,
  ): Promise<Pagina<AlteracaoDadosFiscais>> {
    const onde = and(eq(e.entidade, ENTIDADE_DADOS_FISCAIS), eq(e.entidadeId, clienteId));
    // Em série, não em paralelo: o pool de produção é pequeno (Supabase).
    const linhas = await this.db
      .select({
        id: e.id,
        ocorridoEm: e.ocorridoEm,
        atorTipo: e.atorTipo,
        atorNome: sql<string | null>`coalesce(${usuarios.nome}, ${chavesRobo.nome})`,
        acao: e.acao,
        antes: e.antes,
        depois: e.depois,
      })
      .from(e)
      .leftJoin(usuarios, and(eq(e.atorTipo, 'usuario'), eq(usuarios.id, e.atorId)))
      .leftJoin(chavesRobo, and(eq(e.atorTipo, 'robo'), eq(chavesRobo.id, e.atorId)))
      .where(onde)
      .orderBy(desc(e.ocorridoEm), desc(e.id))
      .limit(porPagina)
      .offset((pagina - 1) * porPagina);
    const [contagem] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(e)
      .where(onde);

    return {
      itens: linhas.map((l) => ({
        id: l.id,
        clienteId,
        ocorridoEm: l.ocorridoEm,
        ator: { tipo: l.atorTipo as AlteracaoDadosFiscais['ator']['tipo'], nome: l.atorNome },
        acao: l.acao,
        antes: l.antes as Json,
        depois: l.depois as Json,
      })),
      total: contagem?.total ?? 0,
    };
  }
}
