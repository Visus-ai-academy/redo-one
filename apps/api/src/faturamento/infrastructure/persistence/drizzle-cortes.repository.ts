import { Inject, Injectable } from '@nestjs/common';
import { asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { DATABASE, type Database } from '../../../database/database';
import { clientes, cortesCompetencia, usuarios } from '../../../database/schema';
import {
  CORTE_PADRAO_INICIAL,
  type Corte,
  type TabelaCortes,
  type VigenciaCliente,
  type VigenciaCorte,
} from '../../../ingestao/domain/competencia';
import { enfileirarRecalculoCompetencias } from '../../../ingestao/infrastructure/jobs/enfileirar-recalculo-competencias';
import type { Autor } from '../../application/ports/competencias.repository';
import type {
  ClienteDoCorte,
  CortesRepository,
  VigenciaRegistrada,
} from '../../application/ports/cortes.repository';
import { camposDoCorte, type NovaVigencia } from '../../domain/vigencia-corte';

const principal = alias(clientes, 'principal');

type Linha = Pick<
  typeof cortesCompetencia.$inferSelect,
  'id' | 'usaPadrao' | 'dia' | 'ultimoDia' | 'mes' | 'consideraExame'
>;

/**
 * Corte da linha; nulo com "usa o padrão". As restrições da tabela garantem os campos; se faltar
 * algum, é dado corrompido e o erro aparece, em vez de um corte inventado.
 */
const corteDa = (l: Linha): Corte | null => {
  if (l.usaPadrao) return null;
  const dia = l.ultimoDia ? 'ultimo' : l.dia;
  if (dia === null || l.mes === null || l.consideraExame === null) {
    throw new Error(`Vigência ${l.id} de corte_competencia inválida: corte incompleto.`);
  }
  return { dia, mes: l.mes, consideraExame: l.consideraExame };
};

/** Também é a porta `LeitorCortesCompetencia` da `ingestao`. */
@Injectable()
export class DrizzleCortesRepository implements CortesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async carregar(): Promise<TabelaCortes> {
    const linhas = await this.db
      .select()
      .from(cortesCompetencia)
      .orderBy(asc(cortesCompetencia.desde));
    const padrao: VigenciaCorte[] = [];
    const porCliente = new Map<string, VigenciaCliente[]>();
    for (const l of linhas) {
      const corte = corteDa(l);
      if (l.clienteId === null) {
        if (corte) padrao.push({ desde: l.desde, corte });
        continue;
      }
      const cadeia = porCliente.get(l.clienteId) ?? [];
      cadeia.push({ desde: l.desde, corte });
      porCliente.set(l.clienteId, cadeia);
    }
    return { padrao: padrao.length > 0 ? padrao : [CORTE_PADRAO_INICIAL], porCliente };
  }

  async garantirPadraoInicial(): Promise<void> {
    const { desde, corte } = CORTE_PADRAO_INICIAL;
    const dia = corte.dia === 'ultimo' ? null : corte.dia;
    // Num comando só: duas subidas ao mesmo tempo não gravam duas linhas.
    await this.db.execute(sql`
      insert into ${cortesCompetencia} (desde, dia, ultimo_dia, mes, considera_exame)
      select ${desde}, ${dia}, ${corte.dia === 'ultimo'}, ${corte.mes}, ${corte.consideraExame}
      where not exists (select 1 from ${cortesCompetencia} where cliente_id is null)
      on conflict do nothing
    `);
  }

  async listarVigencias(clienteId: string | null): Promise<VigenciaRegistrada[]> {
    const linhas = await this.db
      .select({
        id: cortesCompetencia.id,
        clienteId: cortesCompetencia.clienteId,
        desde: cortesCompetencia.desde,
        usaPadrao: cortesCompetencia.usaPadrao,
        dia: cortesCompetencia.dia,
        ultimoDia: cortesCompetencia.ultimoDia,
        mes: cortesCompetencia.mes,
        consideraExame: cortesCompetencia.consideraExame,
        criadoEm: cortesCompetencia.criadoEm,
        criadoPor: usuarios.nome,
      })
      .from(cortesCompetencia)
      .leftJoin(usuarios, eq(usuarios.id, cortesCompetencia.criadoPorId))
      .where(
        clienteId === null
          ? isNull(cortesCompetencia.clienteId)
          : eq(cortesCompetencia.clienteId, clienteId),
      )
      .orderBy(desc(cortesCompetencia.desde));
    return linhas.map((l) => ({
      id: l.id,
      clienteId: l.clienteId,
      desde: l.desde,
      corte: corteDa(l),
      criadoEm: l.criadoEm,
      criadoPor: l.criadoPor,
    }));
  }

  async obterCliente(clienteId: string): Promise<ClienteDoCorte | null> {
    const [linha] = await this.db
      .select({ unificadoEmId: clientes.unificadoEmId, principalNome: principal.nome })
      .from(clientes)
      .leftJoin(principal, eq(principal.id, clientes.unificadoEmId))
      .where(eq(clientes.id, clienteId));
    return linha ?? null;
  }

  criar({ clienteId, desde, corte }: NovaVigencia, { usuarioId, em }: Autor): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [linha] = await tx
        .insert(cortesCompetencia)
        .values({ clienteId, desde, ...camposDoCorte(corte), criadoEm: em, criadoPorId: usuarioId })
        .returning({ id: cortesCompetencia.id });
      if (!linha) throw new Error('Vigência do corte não gravada.');
      // O padrão vale para todos os clientes sem corte próprio (e para os laudos sem cliente).
      await enfileirarRecalculoCompetencias(tx, clienteId === null ? null : [clienteId]);
      return linha.id;
    });
  }
}
