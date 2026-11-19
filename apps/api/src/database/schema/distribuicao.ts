import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
import { alocacoes, turnos } from './escala';
import { usuarios } from './identidade';
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

// ---------------------------------------------------------------------------------------------
// Configurações › Distribuição (global). Uma linha só; histórico em `eventos_auditoria`
// (entidade `configuracao_distribuicao`, id `global`). As listas que apontam para o catálogo e
// para a escala ficam em tabelas filhas (chave estrangeira), não em arrays.
// ---------------------------------------------------------------------------------------------

/** Critério da fila e direção, na ordem em que desempatam. */
export type ItemOrdemFilaGravado = {
  criterio: 'prioridade' | 'prazo' | 'antiguidade';
  direcao: 'asc' | 'desc';
};

export const configuracaoDistribuicao = pgTable(
  'configuracao_distribuicao',
  {
    id: integer('id').primaryKey().default(1),
    ordemFila: jsonb('ordem_fila').$type<ItemOrdemFilaGravado[]>().notNull(),
    agruparPorPaciente: boolean('agrupar_por_paciente').notNull(),
    /** 0 = sem limite. */
    janelaPacienteHoras: integer('janela_paciente_horas').notNull(),
    toleranciaAcimaTeto: integer('tolerancia_acima_teto').notNull(),
    margemUrgenciaPct: integer('margem_urgencia_pct').notNull(),
    folgaProporcaoPct: integer('folga_proporcao_pct').notNull(),
    prazoCriticoMin: integer('prazo_critico_min').notNull(),
    antecedenciaPeriodoMin: integer('antecedencia_periodo_min').notNull(),
    cicloMinutos: integer('ciclo_minutos').notNull(),
    marcadoresEquilibrio: text('marcadores_equilibrio').array().notNull(),
    escalaRestringeEspecialidade: boolean('escala_restringe_especialidade').notNull(),
    diasJaEntregue: integer('dias_ja_entregue').notNull(),
    /** "HH:MM" da rodada que enche os turnos posteriores; null = nenhum turno posterior. */
    turnosPosterioresCheiaEm: text('turnos_posteriores_cheia_em'),
    /** Null = recolhimento desligado. */
    recolhimentoAposTurnoMin: integer('recolhimento_apos_turno_min'),
    /** Carência do recolhimento depois do fim da Lista (no dashboards-one, 24 h fixas). */
    recolhimentoAposListaMin: integer('recolhimento_apos_lista_min').notNull().default(1440),
    /** Desligado, ninguém inicia rodada. */
    roboAtivo: boolean('robo_ativo').notNull().default(true),
    /** Minutos que a proposta vale sem aprovação. */
    expiracaoPropostaMin: integer('expiracao_proposta_min').notNull().default(45),
    /** Máximo de exames propostos por rodada; null = sem teto. */
    tetoPorRodada: integer('teto_por_rodada'),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [check('configuracao_distribuicao_unica', sql`${t.id} = 1`)],
);

/** Turnos que só recebem numa rodada posterior do dia (no dashboards-one, a Tarde). */
export const configuracaoDistribuicaoTurnosPosteriores = pgTable(
  'configuracao_distribuicao_turnos_posteriores',
  {
    turnoId: uuid('turno_id')
      .primaryKey()
      .references(() => turnos.id, { onDelete: 'cascade' }),
  },
);

// ---------------------------------------------------------------------------------------------
// Prioridades da operação (Configurações › Distribuição, decisões de 18/11/2026): cadastro da
// distribuição, separado das prioridades do catálogo (faturamento, escala e arranjo). Cada uma
// tem posição na fila, regra de urgência e um de-para próprio de grafias da MobileMed. Histórico
// em `eventos_auditoria` (entidade `prioridade_operacao`).
// ---------------------------------------------------------------------------------------------

/** Quando a operação trata a prioridade como urgência. */
export const tipoUrgencia = pgEnum('tipo_urgencia', ['nunca', 'sempre', 'prazo']);
/** O que um turno recebe de uma prioridade da operação. */
export const tipoRecebimento = pgEnum('tipo_recebimento', [
  'segue_sla',
  'prazo_minimo',
  'nao_recebe',
]);

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

/** De-para de grafias da MobileMed: cada grafia (sem acento, maiúscula) cai em uma prioridade. */
export const prioridadesOperacaoGrafias = pgTable(
  'prioridades_operacao_grafias',
  {
    /** Sem acento, sem espaços nas pontas e em maiúsculas: a chave do de-para. */
    grafiaNormalizada: text('grafia_normalizada').primaryKey(),
    /** Como foi cadastrada (para a tela). */
    grafia: text('grafia').notNull(),
    prioridadeOperacaoId: uuid('prioridade_operacao_id')
      .notNull()
      .references(() => prioridadesOperacao.id, { onDelete: 'cascade' }),
  },
  (t) => [index('prioridades_operacao_grafias_prioridade_idx').on(t.prioridadeOperacaoId)],
);

const daPrioridadeOperacao = () =>
  uuid('prioridade_operacao_id')
    .notNull()
    .references(() => prioridadesOperacao.id, { onDelete: 'cascade' });

/**
 * Grade geral de recebimento: prioridade da operação × turno da escala. Célula sem linha = segue
 * o SLA. Histórico em `eventos_auditoria` (entidade `recebimento_distribuicao`, id `geral`).
 */
export const recebimentoGeral = pgTable(
  'recebimento_geral',
  {
    prioridadeOperacaoId: daPrioridadeOperacao(),
    turnoId: uuid('turno_id')
      .notNull()
      .references(() => turnos.id, { onDelete: 'cascade' }),
    regra: tipoRecebimento('regra').notNull(),
    /** Só com "prazo_minimo". */
    prazoMinimoHoras: integer('prazo_minimo_horas'),
  },
  (t) => [
    primaryKey({ columns: [t.prioridadeOperacaoId, t.turnoId] }),
    check(
      'recebimento_geral_prazo_check',
      sql`(${t.regra} = 'prazo_minimo') = (${t.prazoMinimoHoras} is not null)`,
    ),
  ],
);

// ---------------------------------------------------------------------------------------------
// Regras da frente: comportamento de uma especialidade OU modalidade do catálogo na distribuição
// (aba Distribuição no painel dela). Frente sem linha = regras neutras. Histórico em
// `eventos_auditoria` (entidade `regras_frente`, id = o da especialidade ou da modalidade).
// ---------------------------------------------------------------------------------------------

export const metodoDivisao = pgEnum('metodo_divisao', ['igualitaria', 'proporcao']);

export const regrasFrente = pgTable(
  'regras_frente',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    especialidadeId: uuid('especialidade_id').references(() => especialidades.id, {
      onDelete: 'cascade',
    }),
    modalidadeId: uuid('modalidade_id').references(() => modalidades.id, { onDelete: 'cascade' }),
    recolheAoFimDoTurno: boolean('recolhe_ao_fim_do_turno').notNull().default(true),
    distribuiPeloRobo: boolean('distribui_pelo_robo').notNull().default(true),
    divisao: metodoDivisao('divisao').notNull().default('igualitaria'),
    /** Teto por médico a cada rodada, além do da escala; null = só o da escala. */
    tetoPorMedico: integer('teto_por_medico'),
    listaDepoisDosFixos: boolean('lista_depois_dos_fixos').notNull().default(false),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex('regras_frente_especialidade_key').on(t.especialidadeId),
    uniqueIndex('regras_frente_modalidade_key').on(t.modalidadeId),
    check(
      'regras_frente_frente_check',
      sql`(${t.especialidadeId} is null) <> (${t.modalidadeId} is null)`,
    ),
  ],
);

const daRegra = () =>
  uuid('regra_frente_id')
    .notNull()
    .references(() => regrasFrente.id, { onDelete: 'cascade' });

/** Urgência sobrescrita na frente, por prioridade da operação. */
export const regrasFrenteUrgencias = pgTable(
  'regras_frente_urgencias',
  {
    regraFrenteId: daRegra(),
    prioridadeOperacaoId: daPrioridadeOperacao(),
    urgencia: tipoUrgencia('urgencia').notNull(),
    urgenciaHoras: integer('urgencia_horas'),
  },
  (t) => [
    primaryKey({ columns: [t.regraFrenteId, t.prioridadeOperacaoId] }),
    check(
      'regras_frente_urgencias_horas_check',
      sql`(${t.urgencia} = 'prazo') = (${t.urgenciaHoras} is not null)`,
    ),
  ],
);

/** Células da grade de recebimento que mudam na frente (as ausentes seguem a geral). */
export const regrasFrenteRecebimento = pgTable(
  'regras_frente_recebimento',
  {
    regraFrenteId: daRegra(),
    prioridadeOperacaoId: daPrioridadeOperacao(),
    turnoId: uuid('turno_id')
      .notNull()
      .references(() => turnos.id, { onDelete: 'cascade' }),
    regra: tipoRecebimento('regra').notNull(),
    prazoMinimoHoras: integer('prazo_minimo_horas'),
  },
  (t) => [
    primaryKey({ columns: [t.regraFrenteId, t.prioridadeOperacaoId, t.turnoId] }),
    check(
      'regras_frente_recebimento_prazo_check',
      sql`(${t.regra} = 'prazo_minimo') = (${t.prazoMinimoHoras} is not null)`,
    ),
  ],
);

/** Faixas em que a frente não é distribuída pelo robô (podem cruzar a meia-noite). */
export const regrasFrenteHorariosSemRobo = pgTable(
  'regras_frente_horarios_sem_robo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    regraFrenteId: daRegra(),
    /** 0 = domingo … 6 = sábado; vazio = todos os dias. */
    diasSemana: integer('dias_semana').array().notNull(),
    inicio: text('inicio').notNull(),
    fim: text('fim').notNull(),
    ordem: integer('ordem').notNull().default(0),
  },
  (t) => [index('regras_frente_horarios_sem_robo_regra_idx').on(t.regraFrenteId)],
);

/** Proporção por modalidade (divisão `proporcao`), em exames. */
export const regrasFrenteProporcoes = pgTable(
  'regras_frente_proporcoes',
  {
    regraFrenteId: daRegra(),
    modalidadeId: uuid('modalidade_id')
      .notNull()
      .references(() => modalidades.id, { onDelete: 'cascade' }),
    percentual: integer('percentual').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.regraFrenteId, t.modalidadeId] }),
    check('regras_frente_proporcoes_percentual_check', sql`${t.percentual} between 1 and 100`),
  ],
);

/** Regras por segmento: teto (e o reduzido), piso e pacote à parte. */
export const regrasFrenteSegmentos = pgTable(
  'regras_frente_segmentos',
  {
    regraFrenteId: daRegra(),
    subespecialidadeId: uuid('subespecialidade_id')
      .notNull()
      .references(() => subespecialidades.id, { onDelete: 'cascade' }),
    /** Máximo de exames do segmento por médico a cada rodada; null = sem teto. */
    teto: integer('teto'),
    /** Teto menor para quem tem produtividade de escala até `teto_reduzido_produtividade_ate`. */
    tetoReduzido: integer('teto_reduzido'),
    tetoReduzidoProdutividadeAte: integer('teto_reduzido_produtividade_ate'),
    piso: integer('piso'),
    pacoteAParte: boolean('pacote_a_parte').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.regraFrenteId, t.subespecialidadeId] }),
    check(
      'regras_frente_segmentos_reduzido_check',
      sql`(${t.tetoReduzido} is null) = (${t.tetoReduzidoProdutividadeAte} is null)`,
    ),
  ],
);

/**
 * Mistura entre segmentos (a do neurologista), na ordem do cadastro. Especialidade nula = o
 * segmento em qualquer especialidade; segmento nulo = o geral da especialidade.
 */
export const regrasFrenteMistura = pgTable(
  'regras_frente_mistura',
  {
    regraFrenteId: daRegra(),
    ordem: integer('ordem').notNull(),
    especialidadeId: uuid('especialidade_id').references(() => especialidades.id, {
      onDelete: 'cascade',
    }),
    subespecialidadeId: uuid('subespecialidade_id').references(() => subespecialidades.id, {
      onDelete: 'cascade',
    }),
  },
  (t) => [
    primaryKey({ columns: [t.regraFrenteId, t.ordem] }),
    check(
      'regras_frente_mistura_fatia_check',
      sql`${t.especialidadeId} is not null or ${t.subespecialidadeId} is not null`,
    ),
  ],
);

/**
 * Prioridade do cliente numa frente (especialidade OU modalidade do catálogo), aba Distribuição
 * do cliente: 1 = Alta, 2 = Média; sem linha = normal. Histórico em `eventos_auditoria`
 * (entidade `prioridades_cliente`, id = o do cliente).
 */
export const prioridadesCliente = pgTable(
  'prioridades_cliente',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => clientes.id, { onDelete: 'cascade' }),
    especialidadeId: uuid('especialidade_id').references(() => especialidades.id, {
      onDelete: 'cascade',
    }),
    modalidadeId: uuid('modalidade_id').references(() => modalidades.id, { onDelete: 'cascade' }),
    nivel: integer('nivel').notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex('prioridades_cliente_especialidade_key').on(t.clienteId, t.especialidadeId),
    uniqueIndex('prioridades_cliente_modalidade_key').on(t.clienteId, t.modalidadeId),
    check(
      'prioridades_cliente_frente_check',
      sql`(${t.especialidadeId} is null) <> (${t.modalidadeId} is null)`,
    ),
    check('prioridades_cliente_nivel_check', sql`${t.nivel} in (1, 2)`),
  ],
);

/**
 * Ajuste do dia da distribuição por alocação da escala e dia (a "exceção do robô" do
 * dashboards-one): prioridades liberadas e "segue o SLA neste dia" (o prazo mínimo da grade de
 * recebimento não vale), com recorte opcional por
 * cliente. O "+N laudos" é o `ajustes_produtividade` da escala, não fica aqui. A ação fica na tela
 * Escala; histórico em `eventos_auditoria` (entidade `ajuste_dia_distribuicao`).
 */
export const ajustesDiaDistribuicao = pgTable(
  'ajustes_dia_distribuicao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    alocacaoId: uuid('alocacao_id')
      .notNull()
      .references(() => alocacoes.id, { onDelete: 'cascade' }),
    data: date('data').notNull(),
    segueSla: boolean('segue_sla').notNull().default(false),
    /** Só os exames deste cliente; null = todos. */
    clienteId: uuid('cliente_id').references(() => clientes.id, { onDelete: 'cascade' }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    unique('ajustes_dia_distribuicao_alocacao_data_key').on(t.alocacaoId, t.data),
    index('ajustes_dia_distribuicao_data_idx').on(t.data),
  ],
);

/** Prioridades do catálogo liberadas no ajuste do dia. */
export const ajustesDiaDistribuicaoPrioridades = pgTable(
  'ajustes_dia_distribuicao_prioridades',
  {
    ajusteId: uuid('ajuste_id')
      .notNull()
      .references(() => ajustesDiaDistribuicao.id, { onDelete: 'cascade' }),
    prioridadeId: uuid('prioridade_id')
      .notNull()
      .references(() => prioridades.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.ajusteId, t.prioridadeId] })],
);

// ---------------------------------------------------------------------------------------------
// Rodadas do robô (Operação › Distribuição): pedido, leitura da fila, proposta, aprovação e
// execução. Só manual por ora (decisão de 17/11/2026). Ver `distribuicao/domain/rodada`.
//
// LGPD: o nome do paciente NUNCA é coluna. A designação guarda o id do exame na MobileMed e o
// HMAC do paciente (agrupa o pacote); o nome é lido na MobileMed na hora da conferência, só por
// quem tem `distribuicao.paciente.ver`, com auditoria. Retenção das designações: a definir (TODO).
// ---------------------------------------------------------------------------------------------

export const statusRodada = pgEnum('status_rodada', [
  'solicitada',
  'lendo',
  'aguardando_aprovacao',
  'aprovada',
  'executando',
  'pausada',
  'parcial',
  'concluida',
  'expirada',
  'cancelada',
  'falhou',
]);

export const rodadas = pgTable(
  'rodadas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: statusRodada('status').notNull().default('solicitada'),
    solicitadaPorId: uuid('solicitada_por_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    aprovadaPorId: uuid('aprovada_por_id').references(() => usuarios.id, {
      onDelete: 'set null',
    }),
    aprovadaEm: timestamp('aprovada_em', { withTimezone: true }),
    // Recortes: foto do pedido, em arrays de ids SEM chave estrangeira de propósito (o histórico
    // não pode sumir nem travar a exclusão de um turno ou cliente). Vazio = sem recorte.
    turnoIds: uuid('turno_ids').array().notNull().default(sql`'{}'`),
    /** Frentes da escala (`frentes_escala`). */
    frenteIds: uuid('frente_ids').array().notNull().default(sql`'{}'`),
    prioridadeOperacaoIds: uuid('prioridade_operacao_ids').array().notNull().default(sql`'{}'`),
    /** Segmentos do catálogo; com o geral, o exame sem segmento também passa. */
    subespecialidadeIds: uuid('subespecialidade_ids').array().notNull().default(sql`'{}'`),
    subespecialidadeGeral: boolean('subespecialidade_geral').notNull().default(false),
    clienteIds: uuid('cliente_ids').array().notNull().default(sql`'{}'`),
    medicosExcluidos: uuid('medicos_excluidos').array().notNull().default(sql`'{}'`),
    /** Entram mesmo fora dos turnos e das frentes do recorte. */
    medicosIncluidos: uuid('medicos_incluidos').array().notNull().default(sql`'{}'`),
    /** Instante da leitura da fila (o minuto da escala que valeu). */
    lidaEm: timestamp('lida_em', { withTimezone: true }),
    /** A proposta não aprovada até aqui expira. */
    expiraEm: timestamp('expira_em', { withTimezone: true }),
    erro: text('erro'),
    /** Avisos da proposta (leitura, cadastro, cota gratificada, grafias sem de-para). */
    avisos: text('avisos').array().notNull().default(sql`'{}'`),
    /** Exames lidos da fila sem médico. */
    lidos: integer('lidos').notNull().default(0),
    /** Exames recolhidos de médicos (fim do turno ou ausência) que entraram na proposta. */
    recolhidos: integer('recolhidos').notNull().default(0),
    /** Dos exames da proposta (lidos e recolhidos), os tratados como urgência pela operação. */
    urgentes: integer('urgentes').notNull().default(0),
    /** O que o motor viu (funil, trilha, médicos, grafias sem de-para): o "por quê" do passo 5. */
    insumos: jsonb('insumos'),
    /** Vezes que a execução foi retomada: a retomada confere a fila antes de cada exame. */
    retomadas: integer('retomadas').notNull().default(0),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    // No máximo uma rodada viva por vez: dois robôs lendo a mesma fila dariam o exame duas vezes.
    uniqueIndex('rodadas_uma_viva_key')
      .on(sql`(true)`)
      .where(
        sql`${t.status} in ('solicitada', 'lendo', 'aguardando_aprovacao', 'aprovada', 'executando', 'pausada', 'parcial')`,
      ),
    index('rodadas_criado_em_idx').on(t.criadoEm),
    index('rodadas_status_idx').on(t.status),
  ],
);

export const statusDesignacao = pgEnum('status_designacao', [
  /** Na proposta, a atribuir. */
  'prevista',
  'executada',
  /** Tirada (conferência, encerramento, cancelamento) ou recusada pela MobileMed. */
  'pulada',
  'falhou',
  /** O motor não a distribuiu (motivo e detalhe dizem por quê). */
  'recusada',
]);

/** Cada exame lido numa rodada, com o destino proposto e o resultado. */
export const designacoes = pgTable(
  'designacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rodadaId: uuid('rodada_id')
      .notNull()
      .references(() => rodadas.id, { onDelete: 'cascade' }),
    /** Ordem da fila do motor na leitura. */
    ordem: integer('ordem').notNull(),
    idExameMobilemed: text('id_exame_mobilemed').notNull(),
    /** HMAC do paciente: agrupa o pacote; nunca o nome. */
    pacienteChave: text('paciente_chave').notNull(), // LGPD: saúde (pseudônimo)
    estudo: text('estudo').notNull(),
    unidade: text('unidade').notNull(),
    exameId: uuid('exame_id').references(() => exames.id, { onDelete: 'set null' }),
    clienteId: uuid('cliente_id').references(() => clientes.id, { onDelete: 'set null' }),
    /** Grafia da prioridade na MobileMed. */
    prioridadeGrafia: text('prioridade_grafia'),
    prioridadeOperacaoId: uuid('prioridade_operacao_id').references(() => prioridadesOperacao.id, {
      onDelete: 'set null',
    }),
    /** Prioridade do catálogo (pelas variações). */
    prioridadeId: uuid('prioridade_id').references(() => prioridades.id, { onDelete: 'set null' }),
    especialidadeId: uuid('especialidade_id').references(() => especialidades.id, {
      onDelete: 'set null',
    }),
    modalidadeId: uuid('modalidade_id').references(() => modalidades.id, {
      onDelete: 'set null',
    }),
    subespecialidadeId: uuid('subespecialidade_id').references(() => subespecialidades.id, {
      onDelete: 'set null',
    }),
    laudos: integer('laudos').notNull().default(1),
    realizadoEm: timestamp('realizado_em', { withTimezone: true }).notNull(),
    entradaEm: timestamp('entrada_em', { withTimezone: true }).notNull(),
    prazo: timestamp('prazo', { withTimezone: true }),
    /** Posição da prioridade da operação na leitura (a ordem da execução usa). */
    posicao: integer('posicao'),
    urgente: boolean('urgente').notNull().default(false),
    /** Quem o motor propôs (fica mesmo se a conferência mover ou tirar). */
    medicoPropostoId: uuid('medico_proposto_id').references(() => medicos.id, {
      onDelete: 'set null',
    }),
    /** A quem vai (prevista) ou foi (executada); null = ninguém. */
    medicoId: uuid('medico_id').references(() => medicos.id, { onDelete: 'set null' }),
    /** Id do exame (na MobileMed) com quem anda no pacote do paciente. */
    agrupadoCom: text('agrupado_com'),
    gratificado: boolean('gratificado').notNull().default(false),
    alocacaoGratificadaId: uuid('alocacao_gratificada_id').references(() => alocacoes.id, {
      onDelete: 'set null',
    }),
    coberturaDeId: uuid('cobertura_de_id').references(() => alocacoes.id, {
      onDelete: 'set null',
    }),
    status: statusDesignacao('status').notNull(),
    motivo: text('motivo'),
    detalhe: text('detalhe'),
    /** A falha (ou o pulo) que vale tentar de novo ao retomar. */
    retentavel: boolean('retentavel').notNull().default(false),
    executadaEm: timestamp('executada_em', { withTimezone: true }),
    /**
     * De quem a conferência tirou o exame: o "Desfazer" devolve a ele, e o robô não o devolve a
     * esse médico por `dias_ja_entregue` dias (como o já entregue).
     */
    retiradoDeId: uuid('retirado_de_id').references(() => medicos.id, { onDelete: 'set null' }),
    retiradaEm: timestamp('retirada_em', { withTimezone: true }),
    /** Mandado a um médico na conferência depois que o motor o deixou de fora. */
    naMao: boolean('na_mao').notNull().default(false),
    /**
     * Recolhido: de quem o exame sai (estava com ele, NOVO, entregue pelo robô ou com ausência no
     * dia). A execução só troca se ele ainda estiver com esse médico; o robô não o devolve a ele.
     */
    recolhidoDeId: uuid('recolhido_de_id').references(() => medicos.id, { onDelete: 'set null' }),
    /** Por que foi recolhido: `turno_encerrado` ou `ausencia`. */
    motivoRecolhimento: text('motivo_recolhimento').$type<'turno_encerrado' | 'ausencia'>(),
    /** Médicos que podiam laudar o exame na leitura, sem chave estrangeira (é histórico). */
    elegiveis: uuid('elegiveis').array().notNull().default(sql`'{}'`),
    /** Médico em turno → o portão onde parou diante do exame (o "por que não pegou"). */
    barrados: jsonb('barrados').$type<Record<string, string>>().notNull().default({}),
  },
  (t) => [
    unique('designacoes_rodada_exame_key').on(t.rodadaId, t.idExameMobilemed),
    index('designacoes_rodada_status_idx').on(t.rodadaId, t.status),
    index('designacoes_rodada_ordem_idx').on(t.rodadaId, t.ordem),
    // "Já entregue": o exame executado para alguém nos últimos N dias.
    index('designacoes_exame_executadas_idx')
      .on(t.idExameMobilemed, t.executadaEm)
      .where(sql`${t.status} = 'executada'`),
    // Cota da Lista gratificada: o que já saiu por ela.
    index('designacoes_alocacao_gratificada_idx')
      .on(t.alocacaoGratificadaId, t.executadaEm)
      .where(sql`${t.status} = 'executada' and ${t.alocacaoGratificadaId} is not null`),
    index('designacoes_medico_idx').on(t.medicoId),
    // "Tirado na conferência": o exame não volta ao médico de quem saiu nos últimos N dias.
    index('designacoes_exame_retiradas_idx')
      .on(t.idExameMobilemed, t.retiradaEm)
      .where(sql`${t.retiradoDeId} is not null`),
  ],
);

/** O diário da rodada: o que a tela mostra enquanto ela anda; com total, a tela desenha a barra. */
export const eventosRodada = pgTable(
  'eventos_rodada',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rodadaId: uuid('rodada_id')
      .notNull()
      .references(() => rodadas.id, { onDelete: 'cascade' }),
    em: timestamp('em', { withTimezone: true }).notNull().defaultNow(),
    texto: text('texto').notNull(),
    atual: integer('atual'),
    total: integer('total'),
  },
  (t) => [index('eventos_rodada_rodada_em_idx').on(t.rodadaId, t.em)],
);
