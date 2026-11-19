import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { especialidades, modalidades, subespecialidades } from './catalogo';
import { usuarios } from './identidade';
import { medicos } from './medicos';
import { prioridadesOperacao } from './prioridades-operacao';

// Contexto `escala`: frentes, turnos, alocações (vínculo do médico ao turno, com recorrência,
// recortes e coberturas), ajustes de produtividade do dia, ausências e o recorte da gestora de
// escala. Os dias são datas puras (`date`, sem fuso), no calendário de Brasília; horários são
// "HH:MM" de Brasília. O histórico vai para `eventos_auditoria` (entidades `turno`, `frente_escala`,
// `alocacao`, `ajuste_produtividade`, `ausencia`, `tipo_ausencia`, `escopo_escala`).

const criadoEm = () => timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () =>
  timestamp('atualizado_em', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Colunas comuns às listas: rótulo para a tela, cor do selo, ordem de exibição e ativo. */
const colunasDeLista = () => ({
  descricao: text('descricao'),
  /** Hex `#RRGGBB` do selo. */
  cor: text('cor'),
  ordem: integer('ordem').notNull().default(0),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

/** "HH:MM" de 00:00 a 23:59. */
const ehHorario = (coluna: AnyPgColumn) => sql`${coluna} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`;

export const tipoFrenteEscala = pgEnum('tipo_frente_escala', ['especialidade', 'modalidade']);

/**
 * Frente da escala: a coluna em que se escala um médico. É uma especialidade (NEURO) ou uma
 * modalidade (RX, TC, MG, DO) do catálogo, nunca as duas; nome, cor, ordem e ativo vêm de lá.
 * Não é cadastro: a linha é só a chave interna para turnos, alocações, ausências e recortes
 * apontarem para um lugar só, criada pelo sistema quando um turno passa a usar o item. A
 * subespecialidade não é frente: é recorte da alocação.
 */
export const frentesEscala = pgTable(
  'frentes_escala',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipo: tipoFrenteEscala('tipo').notNull(),
    especialidadeId: uuid('especialidade_id')
      .unique()
      .references(() => especialidades.id),
    modalidadeId: uuid('modalidade_id')
      .unique()
      .references(() => modalidades.id),
    criadoEm: criadoEm(),
  },
  (t) => [
    check(
      'frentes_escala_destino_check',
      sql`(${t.tipo} = 'especialidade' and ${t.especialidadeId} is not null and ${t.modalidadeId} is null)
        or (${t.tipo} = 'modalidade' and ${t.modalidadeId} is not null and ${t.especialidadeId} is null)`,
    ),
  ],
);

/** `fixo`: Manhã, Tarde, Plantão. `lista`: a Lista de 24 h, com gratificação e regra própria no robô. */
export const tipoTurno = pgEnum('tipo_turno', ['fixo', 'lista']);

export const turnos = pgTable(
  'turnos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: text('nome').notNull().unique(),
    tipo: tipoTurno('tipo').notNull().default('fixo'),
    /** Fim ≤ início: o turno vira a meia-noite; fim = início: 24 h. */
    horarioInicio: text('horario_inicio').notNull(),
    horarioFim: text('horario_fim').notNull(),
    ...colunasDeLista(),
  },
  (t) => [
    index('turnos_ativo_ordem_idx').on(t.ativo, t.ordem),
    check('turnos_horario_inicio_check', ehHorario(t.horarioInicio)),
    check('turnos_horario_fim_check', ehHorario(t.horarioFim)),
  ],
);

/** Frentes que o turno tem: as colunas da escala daquele turno. */
export const turnosFrentes = pgTable(
  'turnos_frentes',
  {
    turnoId: uuid('turno_id')
      .notNull()
      .references(() => turnos.id, { onDelete: 'cascade' }),
    frenteId: uuid('frente_id')
      .notNull()
      .references(() => frentesEscala.id),
  },
  (t) => [
    primaryKey({ columns: [t.turnoId, t.frenteId] }),
    index('turnos_frentes_frente_idx').on(t.frenteId),
  ],
);

/**
 * Alocação: o médico escalado num turno e numa frente, com recorrência. Sem `data_fim` é a
 * escala fixa; com `data_fim` (e sem ser gratificada nem cobertura) é período único, que no
 * mesmo turno e frente substitui a fixa nos dias dele. Com `cobertura_de_id` é a cobertura de
 * outra alocação (o titular sai nesses dias).
 */
export const alocacoes = pgTable(
  'alocacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicoId: uuid('medico_id')
      .notNull()
      .references(() => medicos.id),
    turnoId: uuid('turno_id')
      .notNull()
      .references(() => turnos.id),
    frenteId: uuid('frente_id')
      .notNull()
      .references(() => frentesEscala.id),
    /** 0 = domingo … 6 = sábado. Nunca vazio. */
    diasSemana: integer('dias_semana').array().notNull(),
    /** 1–5 e -1 (última). Vazio = toda semana. */
    semanasDoMes: integer('semanas_do_mes').array().notNull().default(sql`'{}'::integer[]`),
    /** Horário do vínculo, dentro da caixa do turno. */
    horarioInicio: text('horario_inicio').notNull(),
    horarioFim: text('horario_fim').notNull(),
    dataInicio: date('data_inicio').notNull(),
    dataFim: date('data_fim'),
    /** Registros por turno; nulo = não informado (≠ 0). No gratificado é a cota do período. */
    produtividade: integer('produtividade'),
    /** Só em turno `lista`: cota do período, fora do teto do robô. */
    gratificado: boolean('gratificado').notNull().default(false),
    /** Recorte de subespecialidade inclui o geral (exame sem subespecialidade). */
    subespecialidadeGeral: boolean('subespecialidade_geral').notNull().default(false),
    coberturaDeId: uuid('cobertura_de_id').references((): AnyPgColumn => alocacoes.id, {
      onDelete: 'cascade',
    }),
    observacoes: text('observacoes'),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    index('alocacoes_vigencia_idx').on(t.dataInicio, t.dataFim),
    index('alocacoes_medico_idx').on(t.medicoId),
    index('alocacoes_turno_frente_idx').on(t.turnoId, t.frenteId),
    index('alocacoes_cobertura_de_idx').on(t.coberturaDeId),
    check('alocacoes_periodo_check', sql`${t.dataFim} is null or ${t.dataFim} >= ${t.dataInicio}`),
    check('alocacoes_horario_inicio_check', ehHorario(t.horarioInicio)),
    check('alocacoes_horario_fim_check', ehHorario(t.horarioFim)),
    check(
      'alocacoes_produtividade_check',
      sql`${t.produtividade} is null or ${t.produtividade} >= 0`,
    ),
    check('alocacoes_cobertura_check', sql`${t.coberturaDeId} <> ${t.id}`),
  ],
);

/**
 * Recorte de prioridade da alocação, pelas prioridades da operação da distribuição (decisão de
 * 19/11/2026: só recebe Internado quem marca Internado), não pelas do catálogo. Nenhuma linha =
 * sem recorte. Sem cascata: excluir uma prioridade em uso alargaria o recorte calado.
 */
export const alocacoesPrioridades = pgTable(
  'alocacoes_prioridades',
  {
    alocacaoId: uuid('alocacao_id')
      .notNull()
      .references(() => alocacoes.id, { onDelete: 'cascade' }),
    prioridadeId: uuid('prioridade_id')
      .notNull()
      .references(() => prioridadesOperacao.id),
  },
  (t) => [primaryKey({ columns: [t.alocacaoId, t.prioridadeId] })],
);

/**
 * Recorte de subespecialidade (segmento) da alocação. Nenhuma linha e sem
 * `subespecialidade_geral` = sem recorte.
 */
export const alocacoesSubespecialidades = pgTable(
  'alocacoes_subespecialidades',
  {
    alocacaoId: uuid('alocacao_id')
      .notNull()
      .references(() => alocacoes.id, { onDelete: 'cascade' }),
    subespecialidadeId: uuid('subespecialidade_id')
      .notNull()
      .references(() => subespecialidades.id),
  },
  (t) => [primaryKey({ columns: [t.alocacaoId, t.subespecialidadeId] })],
);

/** Produtividade de um dia só de uma alocação (troca a da escala naquele dia). */
export const ajustesProdutividade = pgTable(
  'ajustes_produtividade',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    alocacaoId: uuid('alocacao_id')
      .notNull()
      .references(() => alocacoes.id, { onDelete: 'cascade' }),
    data: date('data').notNull(),
    produtividade: integer('produtividade').notNull(),
    observacoes: text('observacoes'),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique('ajustes_produtividade_alocacao_data_key').on(t.alocacaoId, t.data),
    index('ajustes_produtividade_data_idx').on(t.data),
    check('ajustes_produtividade_valor_check', sql`${t.produtividade} >= 0`),
  ],
);

/** Tipo de ausência (férias, falta...). Editável: o negócio decide a gravidade e quem lança. */
export const tiposAusencia = pgTable('tipos_ausencia', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull().unique(),
  /** Com várias ausências no mesmo dia, vale a de maior gravidade. */
  gravidade: integer('gravidade').notNull().default(0),
  /** Só o gestor lança (ex.: Dispensado); o médico não pede pelo portal. */
  soGestor: boolean('so_gestor').notNull().default(false),
  /** Conta como falta nos indicadores (corpo clínico). */
  contaComoFalta: boolean('conta_como_falta').notNull().default(false),
  ...colunasDeLista(),
});

export const situacaoAusencia = pgEnum('situacao_ausencia', ['pendente', 'aprovada', 'recusada']);
export const origemAusencia = pgEnum('origem_ausencia', ['gestor', 'medico']);

/**
 * Ausência do médico. Só a aprovada tira o médico da escala. Recortes (frentes, turnos, dias
 * da semana) vazios = todos; sem turno = dia inteiro.
 */
export const ausencias = pgTable(
  'ausencias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicoId: uuid('medico_id')
      .notNull()
      .references(() => medicos.id),
    tipoId: uuid('tipo_id')
      .notNull()
      .references(() => tiposAusencia.id),
    dataInicio: date('data_inicio').notNull(),
    dataFim: date('data_fim').notNull(),
    /** 0 = domingo … 6 = sábado. Vazio = todos os dias do período. */
    diasSemana: integer('dias_semana').array().notNull().default(sql`'{}'::integer[]`),
    situacao: situacaoAusencia('situacao').notNull().default('aprovada'),
    origem: origemAusencia('origem').notNull().default('gestor'),
    observacoes: text('observacoes'), // LGPD: saúde
    motivoRecusa: text('motivo_recusa'),
    solicitadaPorId: uuid('solicitada_por_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    revisadaPorId: uuid('revisada_por_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    revisadaEm: timestamp('revisada_em', { withTimezone: true }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    index('ausencias_medico_idx').on(t.medicoId),
    index('ausencias_periodo_idx').on(t.dataInicio, t.dataFim),
    index('ausencias_situacao_idx').on(t.situacao),
    check('ausencias_periodo_check', sql`${t.dataFim} >= ${t.dataInicio}`),
  ],
);

export const ausenciasFrentes = pgTable(
  'ausencias_frentes',
  {
    ausenciaId: uuid('ausencia_id')
      .notNull()
      .references(() => ausencias.id, { onDelete: 'cascade' }),
    frenteId: uuid('frente_id')
      .notNull()
      .references(() => frentesEscala.id),
  },
  (t) => [primaryKey({ columns: [t.ausenciaId, t.frenteId] })],
);

export const ausenciasTurnos = pgTable(
  'ausencias_turnos',
  {
    ausenciaId: uuid('ausencia_id')
      .notNull()
      .references(() => ausencias.id, { onDelete: 'cascade' }),
    turnoId: uuid('turno_id')
      .notNull()
      .references(() => turnos.id),
  },
  (t) => [primaryKey({ columns: [t.ausenciaId, t.turnoId] })],
);

/**
 * Recorte da gestora de escala: ela só vê e edita alocações e ausências dos turnos OU das
 * frentes listados. Sem linha = sem recorte (vê tudo que a permissão deixa).
 */
export const usuariosEscoposEscala = pgTable(
  'usuarios_escopos_escala',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    turnoId: uuid('turno_id').references(() => turnos.id, { onDelete: 'cascade' }),
    frenteId: uuid('frente_id').references(() => frentesEscala.id, { onDelete: 'cascade' }),
  },
  (t) => [
    index('usuarios_escopos_escala_usuario_idx').on(t.usuarioId),
    unique('usuarios_escopos_escala_turno_key').on(t.usuarioId, t.turnoId),
    unique('usuarios_escopos_escala_frente_key').on(t.usuarioId, t.frenteId),
    check(
      'usuarios_escopos_escala_alvo_check',
      sql`(${t.turnoId} is null) <> (${t.frenteId} is null)`,
    ),
  ],
);
