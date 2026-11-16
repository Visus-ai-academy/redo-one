import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { avisosCadastro } from '../../../database/schema';
import type { AvisosCadastroRepository } from '../../application/ports/avisos-cadastro.repository';
import type { PendenciaCadastro, TipoAviso } from '../../domain/preparar-laudo';

const LOTE = 1000;

@Injectable()
export class DrizzleAvisosCadastroRepository implements AvisosCadastroRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async registrar(
    importacaoId: string,
    pendencias: (PendenciaCadastro & { ocorrencias: number })[],
    conferidos: { tipo: TipoAviso; chave: string }[],
    agora: Date,
  ) {
    await this.db.transaction(async (tx) => {
      for (let i = 0; i < pendencias.length; i += LOTE) {
        await tx
          .insert(avisosCadastro)
          .values(
            pendencias.slice(i, i + LOTE).map((p) => ({
              ...p,
              primeiraVezEm: agora,
              ultimaVezEm: agora,
              ultimaImportacaoId: importacaoId,
            })),
          )
          .onConflictDoUpdate({
            target: [avisosCadastro.tipo, avisosCadastro.chave],
            set: {
              valor: sql`excluded.valor`,
              ocorrencias: sql`excluded.ocorrencias`,
              ultimaVezEm: sql`excluded.ultima_vez_em`,
              ultimaImportacaoId: sql`excluded.ultima_importacao_id`,
              // Ignorado continua ignorado (só "reabrir" desfaz); resolvido que volta a faltar reabre.
              status: sql`case when ${avisosCadastro.status} = 'ignorado' then 'ignorado'::status_aviso_cadastro else 'pendente'::status_aviso_cadastro end`,
            },
          });
      }

      const porTipo = new Map<TipoAviso, string[]>();
      for (const c of conferidos) porTipo.set(c.tipo, [...(porTipo.get(c.tipo) ?? []), c.chave]);
      for (const [tipo, chaves] of porTipo) {
        for (let i = 0; i < chaves.length; i += LOTE) {
          await tx
            .update(avisosCadastro)
            .set({ status: 'resolvido', decididoEm: agora, decididoPorId: null })
            .where(
              and(
                eq(avisosCadastro.tipo, tipo),
                eq(avisosCadastro.status, 'pendente'),
                inArray(avisosCadastro.chave, chaves.slice(i, i + LOTE)),
              ),
            );
        }
      }
    });
  }
}
