import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { arquivos } from './arquivos';
import {
  categoriasExame,
  clientes,
  especialidades,
  exames,
  modalidades,
  prioridades,
} from './catalogo';
import { usuarios } from './identidade';
import { medicos } from './medicos';

// Contexto `ingestao`: importações de laudos da MobileMed, os laudos com os cadastros resolvidos,
// os totais pré-somados que os painéis leem e os avisos de cadastro encontrados na importação.

const criadoEm = () => timestamp('criado_em', { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () =>
  timestamp('atualizado_em', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Por onde a planilha chegou. */
export const origemImportacao = pgEnum('origem_importacao', ['upload_manual', 'mobilemed']);

/** Relatório "Descritivo Especialidades" ou "Compartilhamento de exames" (CRD_APOIO). */
export const formatoImportacao = pgEnum('formato_importacao', ['laudos', 'compartilhamento']);

export const statusImportacao = pgEnum('status_importacao', [
  'na_fila',
  'processando',
  'concluida',
  /** A trava contra arquivo truncado barrou: nada foi alterado. */
  'recusada',
  'erro',
]);

export const importacoes = pgTable(
  'importacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    arquivoId: uuid('arquivo_id')
      .notNull()
      .references(() => arquivos.id),
    origem: origemImportacao('origem').notNull(),
    /** Descoberto na leitura (pela coluna COMPARTILHAMENTO_ENVIADO_PARA). */
    formato: formatoImportacao('formato'),
    status: statusImportacao('status').notNull().default('na_fila'),
    enviadaPorId: uuid('enviada_por_id').references(() => usuarios.id),
    criadaEm: criadoEm(),
    iniciadaEm: timestamp('iniciada_em', { withTimezone: true }),
    concluidaEm: timestamp('concluida_em', { withTimezone: true }),
    /** Janela de data do laudo coberta pelo arquivo (dias inteiros, em horário de Brasília). */
    janelaInicio: date('janela_inicio'),
    janelaFim: date('janela_fim'),
    linhasArquivo: integer('linhas_arquivo'),
    inseridos: integer('inseridos'),
    atualizados: integer('atualizados'),
    inalterados: integer('inalterados'),
    removidos: integer('removidos'),
    /** Linhas que não puderam ser lidas (ver `errosLinhas`). */
    invalidas: integer('invalidas'),
    /** Linhas de competência fechada ou com a importação travada. */
    ignoradasCompetenciaFechada: integer('ignoradas_competencia_fechada'),
    /** Até 20 erros de leitura `{ linha, mensagem }`, sem dado de paciente. */
    errosLinhas: jsonb('erros_linhas').$type<{ linha: number; mensagem: string }[]>(),
    /** Motivo da recusa ou do erro. */
    mensagem: text('mensagem'),
  },
  (t) => [
    index('importacoes_criada_idx').on(t.criadaEm),
    index('importacoes_status_idx').on(t.status),
  ],
);

export const origemLaudo = pgEnum('origem_laudo', ['normal', 'compartilhamento']);

export const laudos = pgTable(
  'laudos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Chave natural em sha256 (`identidadeDoLaudo`): é por ela que a importação faz o upsert. */
    identidade: text('identidade').notNull().unique(),
    /** Hash do conteúdo gravado: diz se uma reimportação mudou o laudo. */
    hashConteudo: text('hash_conteudo').notNull(),
    importacaoId: uuid('importacao_id')
      .notNull()
      .references(() => importacoes.id),
    origem: origemLaudo('origem').notNull(),
    /** Texto como chegou da MobileMed; o id é resolvido na importação (nulo = aviso pendente). */
    empresaOrigem: text('empresa_origem').notNull(),
    clienteId: uuid('cliente_id').references(() => clientes.id),
    accessionNumber: text('accession_number'),
    /** HMAC do código do paciente (pseudônimo); o nome e o código não são guardados aqui. */
    pacienteChave: text('paciente_chave').notNull(), // LGPD: saúde
    estudo: text('estudo').notNull(),
    exameId: uuid('exame_id').references(() => exames.id),
    modalidadeOrigem: text('modalidade_origem').notNull(),
    modalidadeId: uuid('modalidade_id').references(() => modalidades.id),
    especialidadeOrigem: text('especialidade_origem'),
    especialidadeId: uuid('especialidade_id').references(() => especialidades.id),
    categoriaId: uuid('categoria_id').references(() => categoriasExame.id),
    prioridadeOrigem: text('prioridade_origem').notNull(),
    prioridadeId: uuid('prioridade_id').references(() => prioridades.id),
    medicoOrigem: text('medico_origem'),
    medicoId: uuid('medico_id').references(() => medicos.id),
    medicoReassinaturaOrigem: text('medico_reassinatura_origem'),
    medicoReassinaturaId: uuid('medico_reassinatura_id').references(() => medicos.id),
    /** VALORES como chegou. */
    valores: numeric('valores', { precision: 12, scale: 2, mode: 'number' }),
    /** Quantas unidades o laudo vale (`volumeDoLaudo`); os painéis somam isto. */
    volume: numeric('volume', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    /** STATUS da MobileMed: Assinado, Reassinado, Não Assinado. */
    status: text('status').notNull(),
    duplicado: boolean('duplicado').notNull().default(false),
    complementar: boolean('complementar').notNull().default(false),
    dataRealizacao: timestamp('data_realizacao', { withTimezone: true }).notNull(),
    dataTransferencia: timestamp('data_transferencia', { withTimezone: true }),
    dataLaudo: timestamp('data_laudo', { withTimezone: true }).notNull(),
    dataPrazo: timestamp('data_prazo', { withTimezone: true }),
    dataReassinatura: timestamp('data_reassinatura', { withTimezone: true }),
    /** Dia do laudo em horário de Brasília: chave dos totais e da janela da importação. */
    diaLaudo: date('dia_laudo').notNull(),
    /** "YYYY-MM" (`competenciaDoLaudo`). */
    competencia: text('competencia').notNull(),
    /** O laudo deixou de vir na janela de uma importação (cancelado, estudo renomeado...). */
    removidoEm: timestamp('removido_em', { withTimezone: true }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    index('laudos_janela_idx').on(t.origem, t.diaLaudo),
    index('laudos_competencia_idx').on(t.competencia),
    index('laudos_cliente_idx').on(t.clienteId, t.diaLaudo),
    index('laudos_medico_idx').on(t.medicoId, t.diaLaudo),
    index('laudos_exame_idx').on(t.exameId),
  ],
);

/**
 * Linha da planilha como chegou, para conferência. Gravada só quando o laudo entra ou muda (a
 * MobileMed reenvia o mesmo laudo a cada importação). Expurgada pela retenção de
 * `parametros_ingestao`.
 */
export const laudosLinhasBrutas = pgTable(
  'laudos_linhas_brutas',
  {
    laudoId: uuid('laudo_id')
      .notNull()
      .references(() => laudos.id, { onDelete: 'cascade' }),
    importacaoId: uuid('importacao_id')
      .notNull()
      .references(() => importacoes.id, { onDelete: 'cascade' }),
    dados: jsonb('dados').notNull(), // LGPD: saúde
    criadoEm: criadoEm(),
  },
  (t) => [
    primaryKey({ columns: [t.laudoId, t.importacaoId] }),
    index('laudos_linhas_brutas_criado_idx').on(t.criadoEm),
  ],
);

/** Peças da quebra do estudo (cada uma vale 1 no faturamento). Não muda o volume do laudo. */
export const laudosPecasQuebra = pgTable(
  'laudos_pecas_quebra',
  {
    laudoId: uuid('laudo_id')
      .notNull()
      .references(() => laudos.id, { onDelete: 'cascade' }),
    ordem: integer('ordem').notNull(),
    exameId: uuid('exame_id')
      .notNull()
      .references(() => exames.id),
    categoriaId: uuid('categoria_id').references(() => categoriasExame.id),
  },
  (t) => [primaryKey({ columns: [t.laudoId, t.ordem] })],
);

/**
 * Totais pré-somados que os painéis leem (nunca os laudos crus): dia do laudo × cliente ×
 * modalidade × especialidade × prioridade × médico × status. Recalculados por dia na importação.
 * A tipificação entra como dimensão quando o `faturamento` existir.
 */
export const totaisLaudosDia = pgTable(
  'totais_laudos_dia',
  {
    dia: date('dia').notNull(),
    clienteId: uuid('cliente_id').references(() => clientes.id),
    modalidadeId: uuid('modalidade_id').references(() => modalidades.id),
    especialidadeId: uuid('especialidade_id').references(() => especialidades.id),
    prioridadeId: uuid('prioridade_id').references(() => prioridades.id),
    medicoId: uuid('medico_id').references(() => medicos.id),
    status: text('status').notNull(),
    /** Linhas (laudos); os painéis usam `volume`. */
    quantidade: integer('quantidade').notNull(),
    volume: numeric('volume', { precision: 14, scale: 2, mode: 'number' }).notNull(),
    /** Laudos com prazo, laudos atrasados e as somas para TAT e atraso médios. */
    comPrazo: integer('com_prazo').notNull(),
    atrasados: integer('atrasados').notNull(),
    somaTatMinutos: bigint('soma_tat_minutos', { mode: 'number' }).notNull(),
    somaAtrasoMinutos: bigint('soma_atraso_minutos', { mode: 'number' }).notNull(),
  },
  (t) => [
    unique('totais_laudos_dia_chave_key')
      .on(
        t.dia,
        t.clienteId,
        t.modalidadeId,
        t.especialidadeId,
        t.prioridadeId,
        t.medicoId,
        t.status,
      )
      .nullsNotDistinct(),
    index('totais_laudos_dia_cliente_idx').on(t.clienteId, t.dia),
    index('totais_laudos_dia_medico_idx').on(t.medicoId, t.dia),
  ],
);

export const tipoAvisoCadastro = pgEnum('tipo_aviso_cadastro', [
  'cliente',
  'medico',
  'estudo',
  'modalidade',
  'especialidade',
  'prioridade',
  /** Grafia sem de-para nas prioridades da operação, vista pela rodada da distribuição. */
  'prioridade_operacao',
]);

export const statusAvisoCadastro = pgEnum('status_aviso_cadastro', [
  'pendente',
  /** Uma importação posterior resolveu (o cadastro foi feito). */
  'resolvido',
  /** Triado: não precisa de cadastro. Volta a pendente só por "reabrir". */
  'ignorado',
]);

/**
 * Pendência de cadastro encontrada na importação (cliente, médico, estudo... desconhecido) ou na
 * rodada da distribuição (grafia de prioridade sem de-para).
 */
export const avisosCadastro = pgTable(
  'avisos_cadastro',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipo: tipoAvisoCadastro('tipo').notNull(),
    /** Grafia normalizada: a mesma pendência em grafias parecidas é um aviso só. */
    chave: text('chave').notNull(),
    /** Como chegou na última vez. */
    valor: text('valor').notNull(),
    status: statusAvisoCadastro('status').notNull().default('pendente'),
    /** Laudos da última importação (ou exames da última rodada) em que apareceu. */
    ocorrencias: integer('ocorrencias').notNull().default(0),
    primeiraVezEm: timestamp('primeira_vez_em', { withTimezone: true }).notNull().defaultNow(),
    ultimaVezEm: timestamp('ultima_vez_em', { withTimezone: true }).notNull().defaultNow(),
    ultimaImportacaoId: uuid('ultima_importacao_id').references(() => importacoes.id, {
      onDelete: 'set null',
    }),
    decididoPorId: uuid('decidido_por_id').references(() => usuarios.id),
    decididoEm: timestamp('decidido_em', { withTimezone: true }),
    /** Obrigatório no aviso ignorado: quem ignora registra o porquê. */
    motivo: text('motivo'),
  },
  (t) => [
    unique('avisos_cadastro_tipo_chave_key').on(t.tipo, t.chave),
    check(
      'avisos_cadastro_ignorado_motivo_check',
      sql`${t.status} <> 'ignorado' or btrim(coalesce(${t.motivo}, '')) <> ''`,
    ),
    index('avisos_cadastro_status_idx').on(t.status, t.tipo),
  ],
);

/**
 * Parâmetros da importação que o negócio muda (linha única, editável por tela com auditoria).
 */
export const parametrosIngestao = pgTable(
  'parametros_ingestao',
  {
    id: integer('id').primaryKey().default(1),
    /** Trava contra arquivo truncado: recusa se sumiriam mais que isto... */
    travaRemocaoMinimo: integer('trava_remocao_minimo').notNull().default(500),
    /** ...e mais que este múltiplo das linhas do arquivo (o dashboards-one usa 500 e 2). */
    travaRemocaoFator: numeric('trava_remocao_fator', {
      precision: 6,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(2),
    /** Dias que a linha crua da planilha fica guardada. */
    retencaoLinhasBrutasDias: integer('retencao_linhas_brutas_dias').notNull().default(90),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [check('parametros_ingestao_unica', sql`${t.id} = 1`)],
);
