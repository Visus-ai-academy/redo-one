import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { Email } from '../../comum/email/envio-email';
import { adicionarJob } from '../../comum/jobs/adicionar-job';
import { TAREFA_ENVIAR_EMAIL } from '../../comum/jobs/tarefa-enviar-email';
import { DATABASE, type Database } from '../../database/database';
import { papeis, tokensSenha, usuarios } from '../../database/schema';
import type {
  NovoTokenSenha,
  TipoTokenSenha,
  TokenSenhaEncontrado,
  TokensSenhaRepository,
} from './tokens-senha.repository';

const convidadoPor = alias(usuarios, 'convidado_por');

@Injectable()
export class DrizzleTokensSenhaRepository implements TokensSenhaRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async emitir(token: NovoTokenSenha, email: Email) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(tokensSenha)
        .set({ usadoEm: token.criadoEm })
        .where(
          and(
            eq(tokensSenha.usuarioId, token.usuarioId),
            eq(tokensSenha.tipo, token.tipo),
            isNull(tokensSenha.usadoEm),
          ),
        );
      await tx.insert(tokensSenha).values({
        usuarioId: token.usuarioId,
        tipo: token.tipo,
        tokenHash: token.tokenHash,
        expiraEm: token.expiraEm,
        criadoPorId: token.criadoPorId,
        criadoEm: token.criadoEm,
      });
      await adicionarJob(tx, TAREFA_ENVIAR_EMAIL, email);
    });
  }

  async buscarPorHash(tokenHash: string): Promise<TokenSenhaEncontrado | null> {
    const [linha] = await this.db
      .select({
        id: tokensSenha.id,
        usuarioId: tokensSenha.usuarioId,
        tipo: tokensSenha.tipo,
        expiraEm: tokensSenha.expiraEm,
        usadoEm: tokensSenha.usadoEm,
        usuario: {
          nome: usuarios.nome,
          email: usuarios.email,
          papelId: usuarios.papelId,
          papelNome: papeis.nome,
          ativo: usuarios.ativo,
        },
        convidadoPorNome: convidadoPor.nome,
      })
      .from(tokensSenha)
      .innerJoin(usuarios, eq(usuarios.id, tokensSenha.usuarioId))
      .innerJoin(papeis, eq(papeis.id, usuarios.papelId))
      .leftJoin(convidadoPor, eq(convidadoPor.id, tokensSenha.criadoPorId))
      .where(eq(tokensSenha.tokenHash, tokenHash))
      .limit(1);
    return linha ? { ...linha, tipo: linha.tipo as TipoTokenSenha } : null;
  }

  async ultimaEmissao(usuarioId: string, tipo: TipoTokenSenha) {
    const [linha] = await this.db
      .select({ criadoEm: tokensSenha.criadoEm })
      .from(tokensSenha)
      .where(and(eq(tokensSenha.usuarioId, usuarioId), eq(tokensSenha.tipo, tipo)))
      .orderBy(desc(tokensSenha.criadoEm))
      .limit(1);
    return linha?.criadoEm ?? null;
  }

  usar(tokenId: string, usuarioId: string, senhaHash: string, em: Date): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // O `usado_em is null` no WHERE impede que dois cliques simultâneos usem o mesmo link.
      const usados = await tx
        .update(tokensSenha)
        .set({ usadoEm: em })
        .where(and(eq(tokensSenha.id, tokenId), isNull(tokensSenha.usadoEm)))
        .returning({ id: tokensSenha.id });
      if (!usados.length) return false;
      await tx
        .update(usuarios)
        .set({ senhaHash, senhaAlteradaEm: em, tentativasFalhas: 0, bloqueadoAte: null })
        .where(eq(usuarios.id, usuarioId));
      return true;
    });
  }
}
