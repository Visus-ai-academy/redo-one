import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { sessoes, usuarios } from '../../database/schema';
import type { NovaSessao, SessaoComUsuario, SessoesRepository } from './sessoes.repository';

@Injectable()
export class DrizzleSessoesRepository implements SessoesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async criar(sessao: NovaSessao) {
    await this.db.insert(sessoes).values({
      usuarioId: sessao.usuarioId,
      tokenHash: sessao.tokenHash,
      criadoEm: sessao.criadaEm,
      ultimoUsoEm: sessao.criadaEm,
      expiraEm: sessao.expiraEm,
      expiraAbsolutoEm: sessao.expiraAbsolutoEm,
      ip: sessao.ip,
      userAgent: sessao.userAgent,
    });
  }

  // Roda em toda requisição: busca pelo índice único de token_hash, junto com o dono.
  async buscarPorTokenHash(tokenHash: string): Promise<SessaoComUsuario | null> {
    const [linha] = await this.db
      .select({
        id: sessoes.id,
        usuarioId: sessoes.usuarioId,
        expiraEm: sessoes.expiraEm,
        expiraAbsolutoEm: sessoes.expiraAbsolutoEm,
        ultimoUsoEm: sessoes.ultimoUsoEm,
        encerradaEm: sessoes.encerradaEm,
        usuario: {
          nome: usuarios.nome,
          email: usuarios.email,
          papelId: usuarios.papelId,
          ativo: usuarios.ativo,
        },
      })
      .from(sessoes)
      .innerJoin(usuarios, eq(usuarios.id, sessoes.usuarioId))
      .where(eq(sessoes.tokenHash, tokenHash))
      .limit(1);
    return linha ?? null;
  }

  async renovar(id: string, expiraEm: Date, ultimoUsoEm: Date) {
    await this.db.update(sessoes).set({ expiraEm, ultimoUsoEm }).where(eq(sessoes.id, id));
  }

  async encerrar(id: string, em: Date) {
    await this.db.update(sessoes).set({ encerradaEm: em }).where(eq(sessoes.id, id));
  }

  async encerrarDoPapel(papelId: string, em: Date) {
    const encerradas = await this.db
      .update(sessoes)
      .set({ encerradaEm: em })
      .where(
        and(
          isNull(sessoes.encerradaEm),
          inArray(
            sessoes.usuarioId,
            this.db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.papelId, papelId)),
          ),
        ),
      )
      .returning({ id: sessoes.id });
    return encerradas.length;
  }
}
