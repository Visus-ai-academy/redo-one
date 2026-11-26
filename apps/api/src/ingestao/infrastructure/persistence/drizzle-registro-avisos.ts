import { Injectable } from '@nestjs/common';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';

import type {
  AvisoLevantado,
  EntidadeAviso,
  ExecutorAvisos,
  OrigemAviso,
  RegistroAvisos,
  TipoAviso,
} from '../../../comum/avisos/registro-avisos';
import { avisosCadastro, avisosEntidades } from '../../../database/schema';

const LOTE = 1000;

const lotes = <T>(itens: readonly T[]) => {
  const saida: T[][] = [];
  for (let i = 0; i < itens.length; i += LOTE) saida.push(itens.slice(i, i + LOTE));
  return saida;
};

/**
 * Os avisos de todos os contextos (`avisos_cadastro` + `avisos_entidades`), na transação de quem
 * chama: com o `db`, abre uma própria.
 */
@Injectable()
export class DrizzleRegistroAvisos implements RegistroAvisos {
  async registrar(
    executor: ExecutorAvisos,
    e: {
      origem: OrigemAviso;
      importacaoId?: string | null;
      levantados: readonly AvisoLevantado[];
      conferidos: readonly { tipo: TipoAviso; chave: string }[];
      agora: Date;
    },
  ) {
    if (!e.levantados.length && !e.conferidos.length) return;
    await executor.transaction(async (tx) => {
      await this.abrir(tx, e.origem, e.importacaoId ?? null, e.levantados, e.agora);
      const porTipo = new Map<TipoAviso, string[]>();
      for (const c of e.conferidos) porTipo.set(c.tipo, [...(porTipo.get(c.tipo) ?? []), c.chave]);
      for (const [tipo, chaves] of porTipo) {
        for (const lote of lotes(chaves)) {
          await tx
            .update(avisosCadastro)
            .set({ status: 'resolvido', decididoEm: e.agora, decididoPorId: null })
            .where(
              and(
                eq(avisosCadastro.tipo, tipo),
                eq(avisosCadastro.status, 'pendente'),
                inArray(avisosCadastro.chave, lote),
              ),
            );
        }
      }
    });
  }

  async sincronizar(
    executor: ExecutorAvisos,
    e: { tipo: TipoAviso; origem: OrigemAviso; levantados: readonly AvisoLevantado[]; agora: Date },
  ) {
    await executor.transaction(async (tx) => {
      const doTipo = e.levantados.filter((l) => l.tipo === e.tipo);
      await this.abrir(tx, e.origem, null, doTipo, e.agora);
      const chaves = doTipo.map((l) => l.chave);
      await tx
        .update(avisosCadastro)
        .set({ status: 'resolvido', decididoEm: e.agora, decididoPorId: null })
        .where(
          and(
            eq(avisosCadastro.tipo, e.tipo),
            eq(avisosCadastro.origem, e.origem),
            eq(avisosCadastro.status, 'pendente'),
            chaves.length ? notInArray(avisosCadastro.chave, chaves) : undefined,
          ),
        );
    });
  }

  async resolverDasEntidades(
    executor: ExecutorAvisos,
    e: { tipos: readonly TipoAviso[]; entidades: readonly EntidadeAviso[]; agora: Date },
  ) {
    if (!e.tipos.length || !e.entidades.length) return;
    const pares = sql.join(
      e.entidades.map((x) => sql`(${x.tipo}, ${x.id}::uuid)`),
      sql`, `,
    );
    await executor
      .update(avisosCadastro)
      .set({ status: 'resolvido', decididoEm: e.agora, decididoPorId: null })
      .where(
        and(
          inArray(avisosCadastro.tipo, [...e.tipos]),
          eq(avisosCadastro.status, 'pendente'),
          sql`exists (select 1 from ${avisosEntidades} e
            where e.aviso_id = avisos_cadastro.id and (e.entidade, e.entidade_id) in (${pares}))`,
        ),
      );
  }

  /** Upsert pelo tipo + chave; as entidades do aviso passam a ser as desta verificação. */
  private async abrir(
    tx: ExecutorAvisos,
    origem: OrigemAviso,
    importacaoId: string | null,
    levantados: readonly AvisoLevantado[],
    agora: Date,
  ) {
    for (const lote of lotes(levantados)) {
      const gravados = await tx
        .insert(avisosCadastro)
        .values(
          lote.map((l) => ({
            tipo: l.tipo,
            chave: l.chave,
            valor: l.valor,
            itens: [...(l.itens ?? [])],
            ocorrencias: l.ocorrencias,
            origem,
            competenciaDesde: l.competencias?.desde ?? null,
            competenciaAte: l.competencias?.ate ?? null,
            primeiraVezEm: agora,
            ultimaVezEm: agora,
            ultimaImportacaoId: importacaoId,
          })),
        )
        .onConflictDoUpdate({
          target: [avisosCadastro.tipo, avisosCadastro.chave],
          set: {
            valor: sql`excluded.valor`,
            itens: sql`excluded.itens`,
            ocorrencias: sql`excluded.ocorrencias`,
            origem: sql`excluded.origem`,
            competenciaDesde: sql`excluded.competencia_desde`,
            competenciaAte: sql`excluded.competencia_ate`,
            ultimaVezEm: sql`excluded.ultima_vez_em`,
            ultimaImportacaoId: sql`excluded.ultima_importacao_id`,
            // Ignorado continua ignorado (só "reabrir" desfaz); resolvido que volta a faltar reabre.
            status: sql`case when ${avisosCadastro.status} = 'ignorado' then 'ignorado'::status_aviso_cadastro else 'pendente'::status_aviso_cadastro end`,
          },
        })
        .returning({
          id: avisosCadastro.id,
          tipo: avisosCadastro.tipo,
          chave: avisosCadastro.chave,
        });

      // Só quem traz entidades mexe nelas: a importação (cadastro que falta) não tem.
      const porChave = new Map(lote.map((l) => [`${l.tipo}:${l.chave}`, l]));
      const comEntidades = gravados.filter((g) => porChave.get(`${g.tipo}:${g.chave}`)?.entidades);
      if (!comEntidades.length) continue;
      await tx.delete(avisosEntidades).where(
        inArray(
          avisosEntidades.avisoId,
          comEntidades.map((g) => g.id),
        ),
      );
      const linhas = comEntidades.flatMap((g) =>
        (porChave.get(`${g.tipo}:${g.chave}`)?.entidades ?? []).map((x) => ({
          avisoId: g.id,
          entidade: x.tipo,
          entidadeId: x.id,
        })),
      );
      if (linhas.length) await tx.insert(avisosEntidades).values(linhas).onConflictDoNothing();
    }
  }
}
