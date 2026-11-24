import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { clientes } from './catalogo';
import { usuarios } from './identidade';

// Contexto `faturamento`: as competências (meses de faturamento) com fechamento e trava da
// importação, e os cortes que decidem a competência de cada laudo (padrão e por cliente).

const quando = (nome: string) => timestamp(nome, { withTimezone: true });
const quem = (nome: string) => uuid(nome).references(() => usuarios.id);

/**
 * Competência "YYYY-MM". A linha nasce na importação (aberta) ou na migração do dashboards-one; mês
 * sem linha está aberto. Quem fechou, reabriu ou travou vem como usuário ou, na migração, como o
 * texto do dashboards-one (`*_por_legado`) quando não há usuário correspondente.
 */
export const competencias = pgTable(
  'competencias',
  {
    competencia: text('competencia').primaryKey(),
    status: text('status', { enum: ['aberta', 'fechada'] }).notNull(),
    fechadaEm: quando('fechada_em'),
    fechadaPorId: quem('fechada_por_id'),
    fechadaPorLegado: text('fechada_por_legado'),
    reabertaEm: quando('reaberta_em'),
    reabertaPorId: quem('reaberta_por_id'),
    reabertaPorLegado: text('reaberta_por_legado'),
    /** Trava a importação mesmo com a competência aberta; reabrir não destrava. */
    importacaoTravadaEm: quando('importacao_travada_em'),
    importacaoTravadaPorId: quem('importacao_travada_por_id'),
    importacaoTravadaPorLegado: text('importacao_travada_por_legado'),
    observacoes: text('observacoes'),
    criadaEm: quando('criada_em').notNull().defaultNow(),
    atualizadaEm: quando('atualizada_em')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('competencias_status_idx').on(t.status),
    check('competencias_status_check', sql`${t.status} in ('aberta', 'fechada')`),
  ],
);

/**
 * Vigência do corte da competência a partir de `desde` ("YYYY-MM"). Sem cliente = o corte padrão;
 * com cliente, um corte próprio ou "usa o padrão". Só se cria vigência nova; a passada não se edita.
 */
export const cortesCompetencia = pgTable(
  'cortes_competencia',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clienteId: uuid('cliente_id').references(() => clientes.id),
    desde: text('desde').notNull(),
    /** Só com cliente: a partir de `desde` ele segue o corte padrão. */
    usaPadrao: boolean('usa_padrao').notNull().default(false),
    /** 1 a 31 (dia maior que o mês vale o último dia); nulo com `ultimo_dia` ou `usa_padrao`. */
    dia: integer('dia'),
    ultimoDia: boolean('ultimo_dia').notNull().default(false),
    /** `seguinte`: o corte cai no mês M+1; `proprio`: no próprio mês M. */
    mes: text('mes', { enum: ['proprio', 'seguinte'] }),
    /** A competência nunca fica antes do mês da data do exame. */
    consideraExame: boolean('considera_exame'),
    criadoEm: quando('criado_em').notNull().defaultNow(),
    criadoPorId: quem('criado_por_id'),
  },
  (t) => [
    uniqueIndex('cortes_competencia_padrao_desde_key')
      .on(t.desde)
      .where(sql`${t.clienteId} is null`),
    uniqueIndex('cortes_competencia_cliente_desde_key')
      .on(t.clienteId, t.desde)
      .where(sql`${t.clienteId} is not null`),
    check('cortes_competencia_dia_check', sql`${t.dia} between 1 and 31`),
    check('cortes_competencia_mes_check', sql`${t.mes} in ('proprio', 'seguinte')`),
    check(
      'cortes_competencia_usa_padrao_check',
      sql`not ${t.usaPadrao} or ${t.clienteId} is not null`,
    ),
    check(
      'cortes_competencia_corte_check',
      sql`case when ${t.usaPadrao}
        then ${t.dia} is null and not ${t.ultimoDia} and ${t.mes} is null and ${t.consideraExame} is null
        else ${t.mes} is not null and ${t.consideraExame} is not null and (${t.dia} is not null) <> ${t.ultimoDia}
      end`,
    ),
  ],
);
