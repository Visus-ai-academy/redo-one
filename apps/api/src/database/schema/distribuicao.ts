import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  clientes,
  especialidades,
  exames,
  modalidades,
  prioridades,
  subespecialidades,
} from './catalogo';
import { equipes, medicos } from './medicos';

// Contexto `distribuicao`: o que cada médico (ou equipe) lauda e os parâmetros do robô por
// médico. Os arranjos são uma união: o médico pega o exame se QUALQUER arranjo dele casar por
// inteiro, e cada eixo vazio significa "todos". O histórico vai para `eventos_auditoria`
// (entidades `arranjos_medico`, `arranjos_equipe`, `medico_distribuicao`).

const criadoEm = () => timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () =>
  timestamp('atualizado_em', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Como a lista de clientes ou de exames do arranjo vale: todos, só os da lista, todos menos eles. */
export const modoVinculo = pgEnum('modo_vinculo', ['todos', 'apenas', 'exceto']);

/**
 * Um arranjo: especialidade (nula = todas) × modalidades × segmentos × prioridades × clientes ×
 * exames. É de um médico ou de uma equipe; o da equipe não dá permissão a ninguém, só direciona
 * o recorte aos membros (e, na equipe de plantão, tira o recorte do robô).
 */
export const arranjos = pgTable(
  'arranjos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicoId: uuid('medico_id').references(() => medicos.id, { onDelete: 'cascade' }),
    equipeId: uuid('equipe_id').references(() => equipes.id, { onDelete: 'cascade' }),
    especialidadeId: uuid('especialidade_id').references(() => especialidades.id),
    /** Recorte de segmento inclui o geral (exame sem subespecialidade). */
    subespecialidadeGeral: boolean('subespecialidade_geral').notNull().default(false),
    modoClientes: modoVinculo('modo_clientes').notNull().default('todos'),
    modoExames: modoVinculo('modo_exames').notNull().default('todos'),
    ordem: integer('ordem').notNull().default(0),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    index('arranjos_medico_idx').on(t.medicoId),
    index('arranjos_equipe_idx').on(t.equipeId),
    check('arranjos_dono_check', sql`(${t.medicoId} is null) <> (${t.equipeId} is null)`),
  ],
);

const doArranjo = () =>
  uuid('arranjo_id')
    .notNull()
    .references(() => arranjos.id, { onDelete: 'cascade' });

/** Modalidades do arranjo. Nenhuma linha = todas. */
export const arranjosModalidades = pgTable(
  'arranjos_modalidades',
  {
    arranjoId: doArranjo(),
    modalidadeId: uuid('modalidade_id')
      .notNull()
      .references(() => modalidades.id),
  },
  (t) => [primaryKey({ columns: [t.arranjoId, t.modalidadeId] })],
);

/** Segmentos do arranjo. Nenhuma linha e sem `subespecialidade_geral` = todos. */
export const arranjosSubespecialidades = pgTable(
  'arranjos_subespecialidades',
  {
    arranjoId: doArranjo(),
    subespecialidadeId: uuid('subespecialidade_id')
      .notNull()
      .references(() => subespecialidades.id),
  },
  (t) => [primaryKey({ columns: [t.arranjoId, t.subespecialidadeId] })],
);

/** Prioridades do catálogo do arranjo. Nenhuma linha = todas. */
export const arranjosPrioridades = pgTable(
  'arranjos_prioridades',
  {
    arranjoId: doArranjo(),
    prioridadeId: uuid('prioridade_id')
      .notNull()
      .references(() => prioridades.id),
  },
  (t) => [primaryKey({ columns: [t.arranjoId, t.prioridadeId] })],
);

/** Clientes da lista do arranjo (lidos conforme `modo_clientes`). */
export const arranjosClientes = pgTable(
  'arranjos_clientes',
  {
    arranjoId: doArranjo(),
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => clientes.id),
  },
  (t) => [primaryKey({ columns: [t.arranjoId, t.clienteId] })],
);

/** Exames da lista do arranjo (lidos conforme `modo_exames`). */
export const arranjosExames = pgTable(
  'arranjos_exames',
  {
    arranjoId: doArranjo(),
    exameId: uuid('exame_id')
      .notNull()
      .references(() => exames.id),
  },
  (t) => [primaryKey({ columns: [t.arranjoId, t.exameId] })],
);

/**
 * Clínicas exclusivas (só em arranjo de médico): no recorte do arranjo, o exame dessas clínicas
 * vai só para os médicos que as marcaram, fora do teto da escala.
 */
export const arranjosClientesExclusivos = pgTable(
  'arranjos_clientes_exclusivos',
  {
    arranjoId: doArranjo(),
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => clientes.id),
  },
  (t) => [
    primaryKey({ columns: [t.arranjoId, t.clienteId] }),
    index('arranjos_clientes_exclusivos_cliente_idx').on(t.clienteId),
  ],
);

/** Parâmetros do robô por médico. Sem linha = não habilitado. */
export const medicosDistribuicao = pgTable(
  'medicos_distribuicao',
  {
    medicoId: uuid('medico_id')
      .primaryKey()
      .references(() => medicos.id, { onDelete: 'cascade' }),
    /** O robô pode entregar exames a ele. */
    habilitadoRobo: boolean('habilitado_robo').notNull().default(false),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [index('medicos_distribuicao_habilitado_idx').on(t.habilitadoRobo)],
);
