import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { tentativasLogin, usuarios } from '../../database/schema';
import type { AcessoRecente, ContaRepository } from './conta.repository';

@Injectable()
export class DrizzleContaRepository implements ContaRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async senha(usuarioId: string) {
    const [linha] = await this.db
      .select({ hash: usuarios.senhaHash, alteradaEm: usuarios.senhaAlteradaEm })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);
    return linha ?? { hash: null, alteradaEm: null };
  }

  async atualizarNome(usuarioId: string, nome: string) {
    await this.db.update(usuarios).set({ nome }).where(eq(usuarios.id, usuarioId));
  }

  async trocarSenha(usuarioId: string, hash: string, em: Date) {
    await this.db
      .update(usuarios)
      .set({ senhaHash: hash, senhaAlteradaEm: em })
      .where(eq(usuarios.id, usuarioId));
  }

  // Usa o índice (usuario_id, criado_em).
  acessosRecentes(usuarioId: string, desde: Date, limite: number): Promise<AcessoRecente[]> {
    return this.db
      .select({
        em: tentativasLogin.criadoEm,
        sucesso: tentativasLogin.sucesso,
        ip: tentativasLogin.ip,
        userAgent: tentativasLogin.userAgent,
      })
      .from(tentativasLogin)
      .where(and(eq(tentativasLogin.usuarioId, usuarioId), gte(tentativasLogin.criadoEm, desde)))
      .orderBy(desc(tentativasLogin.criadoEm))
      .limit(limite);
  }
}
