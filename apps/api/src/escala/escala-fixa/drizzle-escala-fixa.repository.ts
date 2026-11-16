import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import type { EventoAuditoria } from '../../auditoria/auditoria';
import { DATABASE, type Database } from '../../database/database';
import { ajustesProdutividade, alocacoes, turnos } from '../../database/schema';
import {
  DrizzleAlocacoesRepository,
  gravarEventos,
  selecao,
  selecaoAjuste,
  type Transacao,
} from '../alocacoes/drizzle-alocacoes.repository';
import type {
  AlocacaoFixa,
  EscalaFixaRepository,
  GravadoNaEscalaFixa,
  MudancasEscalaFixa,
} from './escala-fixa.repository';

@Injectable()
export class DrizzleEscalaFixaRepository implements EscalaFixaRepository {
  private readonly alocacoesRepo: DrizzleAlocacoesRepository;

  constructor(@Inject(DATABASE) private readonly db: Database) {
    this.alocacoesRepo = new DrizzleAlocacoesRepository(db);
  }

  turno(id: string) {
    return this.alocacoesRepo.turno(id);
  }

  medico(id: string) {
    return this.alocacoesRepo.medico(id);
  }

  fixasDoMedico(medicoId: string, frenteId: string): Promise<AlocacaoFixa[]> {
    return lerFixas(this.db, medicoId, frenteId, false);
  }

  /**
   * Um advisory lock por médico + frente serializa duas gravações da mesma grade (inclusive a
   * primeira, quando ainda não há linha para travar); as fixas lidas ficam travadas até o fim.
   */
  async definir(
    medicoId: string,
    frenteId: string,
    planejar: (fixas: AlocacaoFixa[]) => MudancasEscalaFixa,
    eventosDe: (gravado: GravadoNaEscalaFixa) => EventoAuditoria[],
  ) {
    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`escala-fixa:${medicoId}:${frenteId}`}))`,
      );
      const fixas = await lerFixas(tx, medicoId, frenteId, true);
      const mudancas = planejar(fixas);
      const gravado: GravadoNaEscalaFixa = {
        criadas: mudancas.criar,
        encerradas: [],
        removidas: [],
        ajustesRemovidos: [],
      };

      if (mudancas.remover.length) {
        const ids = mudancas.remover;
        gravado.removidas = await tx
          .select(selecao)
          .from(alocacoes)
          .where(or(inArray(alocacoes.id, ids), inArray(alocacoes.coberturaDeId, ids)))
          .orderBy(sql`${alocacoes.coberturaDeId} is not null`, alocacoes.dataInicio)
          .for('update');
        gravado.ajustesRemovidos = await tx
          .select(selecaoAjuste)
          .from(ajustesProdutividade)
          .where(
            inArray(
              ajustesProdutividade.alocacaoId,
              gravado.removidas.map((a) => a.id),
            ),
          )
          .orderBy(ajustesProdutividade.data)
          .for('update');
        await tx.delete(alocacoes).where(inArray(alocacoes.id, ids));
      }

      const porId = new Map(fixas.map(({ horarioDoTurno: _, ...a }) => [a.id, a]));
      for (const { id, dataFim } of mudancas.encerrar) {
        const antes = porId.get(id);
        if (!antes) continue;
        await tx.update(alocacoes).set({ dataFim }).where(eq(alocacoes.id, id));
        gravado.encerradas.push({ antes, depois: { ...antes, dataFim } });
      }

      if (mudancas.criar.length) {
        // A grade não cria recorte: prioridades e subespecialidades ficam vazias.
        await tx
          .insert(alocacoes)
          .values(
            mudancas.criar.map(({ prioridadeIds, subespecialidadeIds, ...campos }) => campos),
          );
      }

      await gravarEventos(tx, eventosDe(gravado));
    });
  }
}

async function lerFixas(
  db: Database | Transacao,
  medicoId: string,
  frenteId: string,
  travar: boolean,
): Promise<AlocacaoFixa[]> {
  const consulta = db
    .select({
      ...selecao,
      turnoHorarioInicio: turnos.horarioInicio,
      turnoHorarioFim: turnos.horarioFim,
    })
    .from(alocacoes)
    .innerJoin(turnos, eq(turnos.id, alocacoes.turnoId))
    .where(
      and(
        eq(alocacoes.medicoId, medicoId),
        eq(alocacoes.frenteId, frenteId),
        isNull(alocacoes.dataFim),
        isNull(alocacoes.coberturaDeId),
      ),
    )
    .orderBy(alocacoes.dataInicio, alocacoes.id);
  const linhas = travar ? await consulta.for('update', { of: alocacoes }) : await consulta;
  return linhas.map(({ turnoHorarioInicio, turnoHorarioFim, ...a }) => ({
    ...a,
    horarioDoTurno: { horarioInicio: turnoHorarioInicio, horarioFim: turnoHorarioFim },
  }));
}
