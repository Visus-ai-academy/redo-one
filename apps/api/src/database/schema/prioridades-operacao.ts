import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Prioridades da operação (Configurações › Distribuição, decisões de 18/11/2026): cadastro do
// contexto `distribuicao`, separado das prioridades do catálogo (faturamento). Num arquivo à parte
// porque a escala também o referencia (o recorte de prioridade da alocação, 19/11/2026) e o
// `distribuicao.ts` já importa o `escala.ts`: assim não há ciclo de imports. Cada uma tem posição
// na fila, regra de urgência e um de-para próprio de grafias da MobileMed (em `distribuicao.ts`).
// Histórico em `eventos_auditoria` (entidade `prioridade_operacao`).

const criadoEm = () => timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () =>
  timestamp('atualizado_em', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Quando a operação trata a prioridade como urgência. */
export const tipoUrgencia = pgEnum('tipo_urgencia', ['nunca', 'sempre', 'prazo']);

export const prioridadesOperacao = pgTable(
  'prioridades_operacao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: text('nome').notNull(),
    /** 1 = primeiro na fila; empate permitido. */
    posicao: integer('posicao').notNull(),
    urgencia: tipoUrgencia('urgencia').notNull(),
    /** Só com urgência "prazo": urgente quando o prazo restante fica abaixo disto. */
    urgenciaHoras: integer('urgencia_horas'),
    /** Vale para a grafia sem de-para; no máximo uma. */
    padrao: boolean('padrao').notNull().default(false),
    /** Hex `#RRGGBB` nas telas (barra da fila do momento); nula = neutra. */
    cor: text('cor'),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex('prioridades_operacao_nome_key').on(sql`upper(${t.nome})`),
    uniqueIndex('prioridades_operacao_padrao_key').on(t.padrao).where(sql`${t.padrao}`),
    check('prioridades_operacao_posicao_check', sql`${t.posicao} >= 1`),
    check(
      'prioridades_operacao_urgencia_check',
      sql`(${t.urgencia} = 'prazo') = (${t.urgenciaHoras} is not null)`,
    ),
  ],
);
