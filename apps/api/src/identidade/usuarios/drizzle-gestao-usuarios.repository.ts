import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, ilike, isNull, or, type SQL, sql } from 'drizzle-orm';

import type { Email } from '../../comum/email/envio-email';
import { adicionarJob } from '../../comum/jobs/adicionar-job';
import { TAREFA_ENVIAR_EMAIL } from '../../comum/jobs/tarefa-enviar-email';
import { DATABASE, type Database } from '../../database/database';
import { medicos, papeis, sessoes, tokensSenha, usuarios } from '../../database/schema';
import type { NovoTokenSenha } from '../senha/tokens-senha.repository';
import type {
  FiltroUsuarios,
  GestaoUsuariosRepository,
  NovoUsuario,
  SituacaoUsuario,
  UsuarioDetalhe,
  UsuarioResumo,
} from './gestao-usuarios.repository';

/** Mesma ordem de prioridade da regra: desativado > convite pendente > bloqueado > ativo. */
function situacao(agora: Date): SQL<SituacaoUsuario> {
  return sql<SituacaoUsuario>`case
    when not ${usuarios.ativo} then 'desativado'
    when ${usuarios.senhaHash} is null then 'convite_pendente'
    when ${usuarios.bloqueadoAte} > ${agora.toISOString()}::timestamptz then 'bloqueado'
    else 'ativo' end`;
}

const ultimoAcessoEm = sql<Date | null>`(select max(${sessoes.ultimoUsoEm}) from ${sessoes}
  where ${sessoes.usuarioId} = ${usuarios.id})`.mapWith(sessoes.ultimoUsoEm);

@Injectable()
export class DrizzleGestaoUsuariosRepository implements GestaoUsuariosRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private colunas(agora: Date) {
    return {
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      papel: { id: papeis.id, nome: papeis.nome },
      situacao: situacao(agora),
      ultimoAcessoEm,
    };
  }

  async listar(filtro: FiltroUsuarios): Promise<{ itens: UsuarioResumo[]; total: number }> {
    const condicoes: (SQL | undefined)[] = [];
    if (filtro.busca) {
      const digitos = filtro.busca.replace(/\D/g, '');
      condicoes.push(
        or(
          ilike(usuarios.nome, `%${filtro.busca}%`),
          ilike(usuarios.email, `%${filtro.busca}%`),
          digitos.length === 11 ? eq(usuarios.cpf, digitos) : undefined,
        ),
      );
    }
    if (filtro.papelId) condicoes.push(eq(usuarios.papelId, filtro.papelId));
    if (filtro.situacao) condicoes.push(sql`(${situacao(filtro.agora)}) = ${filtro.situacao}`);
    if (filtro.medicoId) condicoes.push(eq(usuarios.medicoId, filtro.medicoId));
    const onde = and(...condicoes);

    const [itens, [totalLinha]] = await Promise.all([
      this.db
        .select(this.colunas(filtro.agora))
        .from(usuarios)
        .innerJoin(papeis, eq(papeis.id, usuarios.papelId))
        .where(onde)
        .orderBy(asc(usuarios.nome))
        .limit(filtro.porPagina)
        .offset((filtro.pagina - 1) * filtro.porPagina),
      this.db.select({ total: count() }).from(usuarios).where(onde),
    ]);
    return { itens, total: totalLinha?.total ?? 0 };
  }

  async buscar(id: string, agora: Date): Promise<UsuarioDetalhe | null> {
    const [usuario] = await this.db
      .select({
        ...this.colunas(agora),
        cpf: usuarios.cpf,
        bloqueadoAte: usuarios.bloqueadoAte,
        criadoEm: usuarios.criadoEm,
      })
      .from(usuarios)
      .innerJoin(papeis, eq(papeis.id, usuarios.papelId))
      .where(eq(usuarios.id, id))
      .limit(1);
    if (!usuario) return null;

    const abertas = await this.db
      .select({
        id: sessoes.id,
        ip: sessoes.ip,
        userAgent: sessoes.userAgent,
        criadaEm: sessoes.criadoEm,
        ultimoUsoEm: sessoes.ultimoUsoEm,
      })
      .from(sessoes)
      .where(
        and(
          eq(sessoes.usuarioId, id),
          isNull(sessoes.encerradaEm),
          sql`${sessoes.expiraEm} > ${agora.toISOString()}::timestamptz`,
        ),
      )
      .orderBy(sql`${sessoes.ultimoUsoEm} desc`);

    const { cpf, ...resto } = usuario;
    return { ...resto, cpfFinal: cpf ? cpf.slice(-2) : null, sessoesAbertas: abertas };
  }

  async existeEmail(email: string) {
    const [linha] = await this.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.email, email))
      .limit(1);
    return !!linha;
  }

  async existeCpf(cpf: string) {
    const [linha] = await this.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.cpf, cpf))
      .limit(1);
    return !!linha;
  }

  convidar(
    novo: NovoUsuario,
    token: Omit<NovoTokenSenha, 'usuarioId'>,
    email: (usuarioId: string) => Email,
  ): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [criado] = await tx.insert(usuarios).values(novo).returning({ id: usuarios.id });
      if (!criado) throw new Error('insert de usuário não devolveu o id');
      await tx.insert(tokensSenha).values({ ...token, usuarioId: criado.id });
      await adicionarJob(tx, TAREFA_ENVIAR_EMAIL, email(criado.id));
      return criado.id;
    });
  }

  async trocarPapel(id: string, papelId: string) {
    await this.db.update(usuarios).set({ papelId }).where(eq(usuarios.id, id));
  }

  async definirAtivo(id: string, ativo: boolean) {
    await this.db.update(usuarios).set({ ativo }).where(eq(usuarios.id, id));
  }

  async desbloquear(id: string) {
    await this.db
      .update(usuarios)
      .set({ tentativasFalhas: 0, bloqueadoAte: null })
      .where(eq(usuarios.id, id));
  }

  async buscarMedico(medicoId: string) {
    const [medico] = await this.db
      .select({ id: medicos.id, nome: medicos.nome })
      .from(medicos)
      .where(eq(medicos.id, medicoId))
      .limit(1);
    return medico ?? null;
  }

  async usuarioDoMedico(medicoId: string) {
    const [usuario] = await this.db
      .select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(eq(usuarios.medicoId, medicoId))
      .limit(1);
    return usuario ?? null;
  }

  async medicoDoUsuario(usuarioId: string) {
    const [usuario] = await this.db
      .select({ medicoId: usuarios.medicoId })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);
    return usuario?.medicoId ?? null;
  }

  async vincularMedico(usuarioId: string, medicoId: string | null) {
    await this.db.update(usuarios).set({ medicoId }).where(eq(usuarios.id, usuarioId));
  }
}
