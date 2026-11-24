import { Inject, Injectable } from '@nestjs/common';
import { and, asc, between, eq, getTableColumns, gt, inArray, notInArray, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  laudos,
  laudosLinhasBrutas,
  laudosPacientes,
  laudosPecasQuebra,
  totaisLaudosDia,
} from '../../../database/schema';
import type {
  AlteracoesLaudos,
  JanelaLaudos,
  LaudoParaRecalculo,
  LaudosRepository,
  LoteRecalculo,
} from '../../application/ports/laudos.repository';
import type { LaudoExistente } from '../../domain/planejar-importacao';
import type { LaudoPreparado } from '../../domain/preparar-laudo';

/** Linhas por comando (o Postgres aceita até 65 mil parâmetros; o laudo tem ~35 colunas). */
const LOTE = 500;

const emLotes = <T>(itens: T[]) =>
  Array.from({ length: Math.ceil(itens.length / LOTE) }, (_, i) =>
    itens.slice(i * LOTE, (i + 1) * LOTE),
  );

/** No conflito pela identidade, tudo vem da linha nova (e o laudo volta a valer). */
const colunasAtualizadas = Object.fromEntries(
  Object.entries(getTableColumns(laudos))
    .filter(([campo]) => !['id', 'identidade', 'criadoEm'].includes(campo))
    .map(([campo, coluna]) => [campo, sql.raw(`excluded."${coluna.name}"`)]),
);

const linhaDoLaudo = (
  { pecas: _pecas, paciente: _paciente, ...l }: LaudoPreparado,
  importacaoId: string,
) => ({
  ...l,
  importacaoId,
  removidoEm: null,
});

@Injectable()
export class DrizzleLaudosRepository implements LaudosRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async existentesNaJanela(j: JanelaLaudos): Promise<Map<string, LaudoExistente>> {
    const linhas = await this.db
      .select({
        identidade: laudos.identidade,
        hashConteudo: laudos.hashConteudo,
        removido: sql<boolean>`${laudos.removidoEm} is not null`,
        // Só a conferência (HMAC): a importação não lê o nome gravado.
        pacienteConferencia: laudosPacientes.conferencia,
        medicoIdMobilemed: laudos.medicoIdMobilemed,
        medicoReassinaturaIdMobilemed: laudos.medicoReassinaturaIdMobilemed,
      })
      .from(laudos)
      .leftJoin(laudosPacientes, eq(laudosPacientes.laudoId, laudos.id))
      .where(
        and(
          eq(laudos.origem, j.origem),
          between(laudos.diaLaudo, j.inicio, j.fim),
          j.empresas ? inArray(laudos.empresaOrigem, j.empresas) : undefined,
          j.competenciasBloqueadas.length
            ? notInArray(laudos.competencia, j.competenciasBloqueadas)
            : undefined,
        ),
      );
    return new Map(linhas.map(({ identidade, ...l }) => [identidade, l]));
  }

  async aplicar(importacaoId: string, j: JanelaLaudos, a: AlteracoesLaudos, agora: Date) {
    await this.db.transaction(async (tx) => {
      for (const lote of emLotes([...a.inserir, ...a.atualizar])) {
        const gravados = await tx
          .insert(laudos)
          .values(lote.map((l) => linhaDoLaudo(l, importacaoId)))
          .onConflictDoUpdate({ target: laudos.identidade, set: colunasAtualizadas })
          .returning({ id: laudos.id, identidade: laudos.identidade });
        const idPorIdentidade = new Map(gravados.map((g) => [g.identidade, g.id]));

        await tx
          .delete(laudosPecasQuebra)
          .where(inArray(laudosPecasQuebra.laudoId, [...idPorIdentidade.values()]));
        const pecas = lote.flatMap((l) =>
          l.pecas.map((p, ordem) => ({
            laudoId: idPorIdentidade.get(l.identidade) ?? '',
            ordem,
            ...p,
          })),
        );
        if (pecas.length) await tx.insert(laudosPecasQuebra).values(pecas);

        const brutas = lote.flatMap((l) => {
          const dados = a.linhasBrutas.get(l.identidade);
          const laudoId = idPorIdentidade.get(l.identidade);
          return dados && laudoId ? [{ laudoId, importacaoId, dados }] : [];
        });
        if (brutas.length) await tx.insert(laudosLinhasBrutas).values(brutas).onConflictDoNothing();
      }

      // O id da conta MobileMed do laudo sem outra mudança (fora do hash); nulo mantém o gravado.
      for (const lote of emLotes([...a.idsMedico])) {
        const valores = sql.join(
          lote.map(
            ([identidade, ids]) =>
              sql`(${identidade}::text, ${ids.medicoIdMobilemed}::integer, ${ids.medicoReassinaturaIdMobilemed}::integer)`,
          ),
          sql`, `,
        );
        await tx.execute(sql`
          update ${laudos} set
            medico_id_mobilemed = coalesce(v.assinou, ${laudos.medicoIdMobilemed}),
            medico_reassinatura_id_mobilemed =
              coalesce(v.reassinou, ${laudos.medicoReassinaturaIdMobilemed}),
            atualizado_em = ${agora}
          from (values ${valores}) as v(identidade, assinou, reassinou)
          where ${laudos.identidade} = v.identidade
        `);
      }

      // O paciente vai à parte, também de laudo sem outra mudança (o que não o tinha ganha).
      for (const lote of emLotes([...a.pacientes])) {
        const ids = await tx
          .select({ id: laudos.id, identidade: laudos.identidade })
          .from(laudos)
          .where(
            inArray(
              laudos.identidade,
              lote.map(([identidade]) => identidade),
            ),
          );
        const pacientes = ids.flatMap(({ id, identidade }) => {
          const p = a.pacientes.get(identidade);
          return p ? [{ laudoId: id, ...p }] : [];
        });
        if (!pacientes.length) continue;
        await tx
          .insert(laudosPacientes)
          .values(pacientes)
          .onConflictDoUpdate({
            target: laudosPacientes.laudoId,
            set: {
              nome: sql.raw('excluded."nome"'),
              codigo: sql.raw('excluded."codigo"'),
              conferencia: sql.raw('excluded."conferencia"'),
              atualizadoEm: agora,
            },
          });
      }

      for (const lote of emLotes(a.remover)) {
        await tx
          .update(laudos)
          .set({ removidoEm: agora, importacaoId })
          .where(inArray(laudos.identidade, lote));
      }

      // Totais dos dias da janela, refeitos do zero: idempotente e sem conta incremental.
      await tx.delete(totaisLaudosDia).where(between(totaisLaudosDia.dia, j.inicio, j.fim));
      await tx.execute(sql`
        insert into ${totaisLaudosDia} (dia, cliente_id, modalidade_id, especialidade_id,
          prioridade_id, medico_id, status, quantidade, volume, com_prazo, atrasados,
          soma_tat_minutos, soma_atraso_minutos)
        select dia_laudo, cliente_id, modalidade_id, especialidade_id, prioridade_id, medico_id,
          status, count(*), sum(volume), count(data_prazo),
          count(*) filter (where data_laudo > data_prazo),
          coalesce(sum(greatest(0, round(extract(epoch from data_laudo - data_realizacao) / 60))), 0),
          coalesce(sum(round(extract(epoch from data_laudo - data_prazo) / 60))
            filter (where data_laudo > data_prazo), 0)
        from ${laudos}
        where dia_laudo between ${j.inicio} and ${j.fim} and removido_em is null
        group by dia_laudo, cliente_id, modalidade_id, especialidade_id, prioridade_id, medico_id,
          status
      `);
    });
  }

  async lerParaRecalculo(lote: LoteRecalculo): Promise<LaudoParaRecalculo[]> {
    if (lote.clienteIds?.length === 0) return [];
    return this.db
      .select({
        id: laudos.id,
        clienteId: laudos.clienteId,
        dataRealizacao: laudos.dataRealizacao,
        dataLaudo: laudos.dataLaudo,
        competencia: laudos.competencia,
      })
      .from(laudos)
      .where(
        and(
          lote.depoisDe ? gt(laudos.id, lote.depoisDe) : undefined,
          lote.clienteIds ? inArray(laudos.clienteId, lote.clienteIds) : undefined,
          lote.competenciasBloqueadas.length
            ? notInArray(laudos.competencia, lote.competenciasBloqueadas)
            : undefined,
        ),
      )
      .orderBy(asc(laudos.id))
      .limit(lote.limite);
  }

  async atualizarCompetencias(mudancas: { id: string; competencia: string }[], agora: Date) {
    for (const lote of emLotes(mudancas)) {
      const valores = sql.join(
        lote.map(({ id, competencia }) => sql`(${id}::uuid, ${competencia}::text)`),
        sql`, `,
      );
      await this.db.execute(sql`
        update ${laudos} set competencia = v.competencia, atualizado_em = ${agora}
        from (values ${valores}) as v(id, competencia)
        where ${laudos.id} = v.id
      `);
    }
  }
}
