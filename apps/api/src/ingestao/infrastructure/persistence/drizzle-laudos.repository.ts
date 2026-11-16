import { Inject, Injectable } from '@nestjs/common';
import { and, between, eq, getTableColumns, inArray, notInArray, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import {
  laudos,
  laudosLinhasBrutas,
  laudosPecasQuebra,
  totaisLaudosDia,
} from '../../../database/schema';
import type {
  AlteracoesLaudos,
  JanelaLaudos,
  LaudosRepository,
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

const linhaDoLaudo = ({ pecas: _pecas, ...l }: LaudoPreparado, importacaoId: string) => ({
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
      })
      .from(laudos)
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
}
