import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// Contexto `identidade`: usuários, papéis com permissões `tela.acao`, sessões e tentativas de login.

const criadoEm = () => timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();

export const papeis = pgTable('papeis', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull().unique(),
  descricao: text('descricao'),
  /** Papel fixo do sistema (Administrador, Médico): não pode ser editado nem excluído. */
  sistema: boolean('sistema').notNull().default(false),
  criadoEm: criadoEm(),
});

export const papeisPermissoes = pgTable(
  'papeis_permissoes',
  {
    papelId: uuid('papel_id')
      .notNull()
      .references(() => papeis.id, { onDelete: 'cascade' }),
    /** Chave `tela.acao` ou `tela.grupo.acao` (ex.: `faturamento.competencia.fechar`). */
    permissao: text('permissao').notNull(),
  },
  (t) => [primaryKey({ columns: [t.papelId, t.permissao] })],
);

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(), // LGPD: pessoal
  /** Sempre em minúsculas; é a chave de login junto com o CPF. */
  email: text('email').notNull().unique(), // LGPD: pessoal
  /** Só dígitos. Opcional: permite entrar pelo CPF. */
  cpf: text('cpf').unique(), // LGPD: pessoal
  /** Nulo enquanto o convite não foi aceito. */
  senhaHash: text('senha_hash'),
  senhaAlteradaEm: timestamp('senha_alterada_em', { withTimezone: true }),
  papelId: uuid('papel_id')
    .notNull()
    .references(() => papeis.id),
  ativo: boolean('ativo').notNull().default(true),
  /** Falhas seguidas de senha; zera no login com sucesso ou no desbloqueio. */
  tentativasFalhas: integer('tentativas_falhas').notNull().default(0),
  bloqueadoAte: timestamp('bloqueado_ate', { withTimezone: true }),
  criadoEm: criadoEm(),
});

export const sessoes = pgTable(
  'sessoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    /** SHA-256 do token do cookie; o token em si nunca é gravado. */
    tokenHash: text('token_hash').notNull().unique(),
    /** Renovada a cada uso (7 dias sem uso). */
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    /** Limite absoluto (30 dias após o login), não muda com o uso. */
    expiraAbsolutoEm: timestamp('expira_absoluto_em', { withTimezone: true }).notNull(),
    ultimoUsoEm: timestamp('ultimo_uso_em', { withTimezone: true }).notNull(),
    encerradaEm: timestamp('encerrada_em', { withTimezone: true }),
    ip: text('ip'), // LGPD: pessoal
    userAgent: text('user_agent'),
    criadoEm: criadoEm(),
  },
  (t) => [index('sessoes_usuario_id_idx').on(t.usuarioId)],
);

/** Uma linha por tentativa de login, para o bloqueio por IP e a lista "Acessos recentes". */
export const tentativasLogin = pgTable(
  'tentativas_login',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ip: text('ip').notNull(), // LGPD: pessoal
    /** Nulo quando o e-mail/CPF digitado não corresponde a ninguém. */
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'cascade' }),
    sucesso: boolean('sucesso').notNull(),
    userAgent: text('user_agent'),
    criadoEm: criadoEm(),
  },
  (t) => [
    index('tentativas_login_ip_criado_em_idx').on(t.ip, t.criadoEm),
    index('tentativas_login_usuario_id_criado_em_idx').on(t.usuarioId, t.criadoEm),
  ],
);
