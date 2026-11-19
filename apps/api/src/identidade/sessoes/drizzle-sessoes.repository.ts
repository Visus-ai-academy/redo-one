import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { papeis, papeisPermissoes, sessoes, usuarios, usuariosPapeis } from '../../database/schema';
import type {
  NovaSessao,
  SessaoAutenticavel,
  SessaoComUsuario,
  SessoesAutenticacaoRepository,
  SessoesRepository,
} from './sessoes.repository';

@Injectable()
export class DrizzleSessoesRepository implements SessoesRepository, SessoesAutenticacaoRepository {
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
        usuario: { nome: usuarios.nome, email: usuarios.email, ativo: usuarios.ativo },
      })
      .from(sessoes)
      .innerJoin(usuarios, eq(usuarios.id, sessoes.usuarioId))
      .where(eq(sessoes.tokenHash, tokenHash))
      .limit(1);
    return linha ?? null;
  }

  // Roda em toda requisição: uma ida só ao banco (índice único de token_hash + chaves primárias).
  // Papéis e permissões vêm agregados em arrays (a união dos papéis); com acesso total, não
  // precisa das permissões.
  async buscarParaAutenticar(tokenHash: string): Promise<SessaoAutenticavel | null> {
    const [linha] = await this.db
      .select({
        id: sessoes.id,
        usuarioId: sessoes.usuarioId,
        expiraEm: sessoes.expiraEm,
        expiraAbsolutoEm: sessoes.expiraAbsolutoEm,
        ultimoUsoEm: sessoes.ultimoUsoEm,
        encerradaEm: sessoes.encerradaEm,
        usuario: { nome: usuarios.nome, email: usuarios.email, ativo: usuarios.ativo },
        papeis: sql<{ id: string; nome: string }[]>`coalesce((
          select json_agg(json_build_object('id', p.id, 'nome', p.nome) order by p.nome)
          from ${usuariosPapeis} up join ${papeis} p on p.id = up.papel_id
          where up.usuario_id = ${usuarios.id}
        ), '[]'::json)`,
        acessoTotal: sql<boolean>`exists(
          select 1 from ${usuariosPapeis} up join ${papeis} p on p.id = up.papel_id
          where up.usuario_id = ${usuarios.id} and p.acesso_total
        )`,
        permissoes: sql<string[]>`array(
          select distinct pp.permissao
          from ${usuariosPapeis} up join ${papeisPermissoes} pp on pp.papel_id = up.papel_id
          where up.usuario_id = ${usuarios.id}
        )`,
      })
      .from(sessoes)
      .innerJoin(usuarios, eq(usuarios.id, sessoes.usuarioId))
      .where(eq(sessoes.tokenHash, tokenHash))
      .limit(1);
    if (!linha) return null;
    const { papeis: dosPapeis, acessoTotal, permissoes, ...sessao } = linha;
    return {
      ...sessao,
      acesso: {
        papeis: dosPapeis,
        acessoTotal,
        permissoes: acessoTotal ? [] : (permissoes ?? []),
      },
    };
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
            this.db
              .select({ id: usuariosPapeis.usuarioId })
              .from(usuariosPapeis)
              .where(eq(usuariosPapeis.papelId, papelId)),
          ),
        ),
      )
      .returning({ id: sessoes.id });
    return encerradas.length;
  }

  async encerrarDoUsuario(usuarioId: string, em: Date, excetoSessaoId?: string) {
    const encerradas = await this.db
      .update(sessoes)
      .set({ encerradaEm: em })
      .where(
        and(
          eq(sessoes.usuarioId, usuarioId),
          isNull(sessoes.encerradaEm),
          excetoSessaoId ? ne(sessoes.id, excetoSessaoId) : undefined,
        ),
      )
      .returning({ id: sessoes.id });
    return encerradas.length;
  }
}
