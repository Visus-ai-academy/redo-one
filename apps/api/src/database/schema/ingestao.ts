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

import type { TipoAviso } from '../../comum/avisos/registro-avisos';
import { arquivos } from './arquivos';
import {
  categoriasExame,
  clientes,
  especialidades,
  exames,
  modalidades,
  prioridades,
} from './catalogo';
import { papeis, usuarios } from './identidade';
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
    /** A planilha do upload; a importação da MobileMed não tem arquivo. */
    arquivoId: uuid('arquivo_id').references(() => arquivos.id),
    origem: origemImportacao('origem').notNull(),
    /**
     * No upload, descoberto na leitura (pela coluna COMPARTILHAMENTO_ENVIADO_PARA); na MobileMed,
     * o relatório pedido.
     */
    formato: formatoImportacao('formato'),
    status: statusImportacao('status').notNull().default('na_fila'),
    enviadaPorId: uuid('enviada_por_id').references(() => usuarios.id),
    criadaEm: criadoEm(),
    iniciadaEm: timestamp('iniciada_em', { withTimezone: true }),
    concluidaEm: timestamp('concluida_em', { withTimezone: true }),
    /**
     * Janela de data do laudo coberta (dias inteiros, em horário de Brasília): no upload, os dias
     * do arquivo; na MobileMed, o período pedido, gravado ao criar.
     */
    janelaInicio: date('janela_inicio'),
    janelaFim: date('janela_fim'),
    linhasArquivo: integer('linhas_arquivo'),
    inseridos: integer('inseridos'),
    atualizados: integer('atualizados'),
    inalterados: integer('inalterados'),
    removidos: integer('removidos'),
    /** Linhas que não puderam ser lidas (ver `errosLinhas`). */
    invalidas: integer('invalidas'),
    /** Linhas de competência bloqueada (fechada ou travada), calculada ou do laudo já gravado. */
    ignoradasCompetenciaFechada: integer('ignoradas_competencia_fechada'),
    /** Até 20 erros de leitura `{ linha, mensagem }`, sem dado de paciente. */
    errosLinhas: jsonb('erros_linhas').$type<{ linha: number; mensagem: string }[]>(),
    /** Motivo da recusa ou do erro. */
    mensagem: text('mensagem'),
  },
  (t) => [
    index('importacoes_criada_idx').on(t.criadaEm),
    index('importacoes_status_idx').on(t.status),
    // A última da MobileMed (intervalo do agendamento) e as em curso (uma por vez).
    index('importacoes_origem_criada_idx').on(t.origem, t.criadaEm),
    check(
      'importacoes_fonte_check',
      sql`(${t.origem} = 'upload_manual') = (${t.arquivoId} is not null)`,
    ),
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
    /**
     * Unidade de origem, quando a empresa casou com uma unidade (`clientes.unificado_em_id`): o
     * `cliente_id` é o principal, e a tipificação usa a configuração da unidade.
     */
    unidadeId: uuid('unidade_id').references(() => clientes.id),
    accessionNumber: text('accession_number'),
    /** HMAC do código do paciente (pseudônimo); o nome e o código ficam em `laudos_pacientes`. */
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
    /**
     * Conta MobileMed de quem assinou e de quem reassinou (só a importação pela API traz). Resolve
     * o médico antes do nome; fica fora do hash do conteúdo.
     */
    medicoIdMobilemed: integer('medico_id_mobilemed'),
    medicoReassinaturaIdMobilemed: integer('medico_reassinatura_id_mobilemed'),
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
    /** "YYYY-MM" (`competenciaPelaCadeia`, pela cadeia de cortes do cliente). */
    competencia: text('competencia').notNull(),
    /** O laudo deixou de vir na janela de uma importação (cancelado, estudo renomeado...). */
    removidoEm: timestamp('removido_em', { withTimezone: true }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    index('laudos_janela_idx').on(t.origem, t.diaLaudo),
    // Os totais refeitos por dia leem só os laudos que valem.
    index('laudos_dia_vigentes_idx').on(t.diaLaudo).where(sql`${t.removidoEm} is null`),
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

/**
 * Nome e código do paciente de cada laudo (1:1), como chegaram da MobileMed: à parte de `laudos`
 * para que só quem precisa leia. Leitura só pela porta `PacientesLaudos`, com
 * `importacao.paciente.ver` e auditada; nunca em log, erro, analytics nem totais. A distribuição
 * não grava paciente (o nome da rodada fica em memória). Retenção: a do laudo (sai em cascata com ele).
 */
export const laudosPacientes = pgTable('laudos_pacientes', {
  laudoId: uuid('laudo_id')
    .primaryKey()
    .references(() => laudos.id, { onDelete: 'cascade' }),
  nome: text('nome'), // LGPD: saúde
  /** Código do paciente na MobileMed, como chegou (com os zeros à esquerda). */
  codigo: text('codigo'), // LGPD: saúde
  /** HMAC do nome e do código: diz se a reimportação tem de regravar o paciente. */
  conferencia: text('conferencia').notNull(),
  atualizadoEm: atualizadoEm(),
});

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

export const statusAvisoCadastro = pgEnum('status_aviso_cadastro', [
  'pendente',
  /** A verificação seguinte da origem não achou mais a causa (o cadastro foi feito). */
  'resolvido',
  /** Triado: não precisa de ação. Volta a pendente só por "reabrir". */
  'ignorado',
]);

/**
 * Configuração de cada tipo de aviso (Configurações › Avisos), uma linha por tipo, criada pela
 * migration que traz o tipo: os papéis responsáveis e se o aviso pendente impede fechar a
 * competência a que se liga. Editável por tela, com auditoria.
 */
export const tiposAviso = pgTable('tipos_aviso', {
  /** Um de `TIPOS_AVISO` (`comum/avisos/registro-avisos.ts`). */
  tipo: text('tipo').$type<TipoAviso>().primaryKey(),
  impedeFecharCompetencia: boolean('impede_fechar_competencia').notNull().default(false),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

/** Papéis responsáveis pelo tipo: o aviso pendente aparece na faixa de quem tem um deles. */
export const tiposAvisoResponsaveis = pgTable(
  'tipos_aviso_responsaveis',
  {
    tipo: text('tipo')
      .$type<TipoAviso>()
      .notNull()
      .references(() => tiposAviso.tipo, { onDelete: 'cascade' }),
    papelId: uuid('papel_id')
      .notNull()
      .references(() => papeis.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.tipo, t.papelId] }),
    index('tipos_aviso_responsaveis_papel_idx').on(t.papelId),
  ],
);

/**
 * Inconsistência encontrada por qualquer contexto (Operação › Avisos): cadastro que falta na
 * importação (cliente, médico, estudo... desconhecido), grafia ou conta vista pela rodada da
 * distribuição, preço repetido e item do catálogo criados pela carga do dashboards-one, nome de
 * cliente ambíguo. A mesma chave no tipo é um aviso só.
 */
export const avisosCadastro = pgTable(
  'avisos_cadastro',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Um de `TIPOS_AVISO`, com a linha em `tipos_aviso`. */
    tipo: text('tipo')
      .$type<TipoAviso>()
      .notNull()
      .references(() => tiposAviso.tipo),
    /** Grafia normalizada: a mesma pendência em grafias parecidas é um aviso só. */
    chave: text('chave').notNull(),
    /** Como chegou na última vez. */
    valor: text('valor').notNull(),
    status: statusAvisoCadastro('status').notNull().default('pendente'),
    /** Quem encontrou: importação, rodada, carga, tela ou job. */
    origem: text('origem', { enum: ['importacao', 'rodada', 'carga', 'tela', 'job'] })
      .notNull()
      .default('importacao'),
    /**
     * Competências "AAAA-MM" a que o aviso se liga (as dos laudos, ou as em que o preço vale), para
     * a trava do fechamento; `ate` nulo = dali em diante. Sem `desde`, não se liga a nenhuma.
     */
    competenciaDesde: text('competencia_desde'),
    competenciaAte: text('competencia_ate'),
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
    check(
      'avisos_cadastro_origem_check',
      sql`${t.origem} in ('importacao', 'rodada', 'carga', 'tela', 'job')`,
    ),
    check(
      'avisos_cadastro_competencias_check',
      sql`${t.competenciaAte} is null or (${t.competenciaDesde} is not null and ${t.competenciaAte} >= ${t.competenciaDesde})`,
    ),
    index('avisos_cadastro_status_idx').on(t.status, t.tipo),
    // A faixa do responsável (o mais antigo pendente) e a trava do fechamento.
    index('avisos_cadastro_pendentes_idx')
      .on(t.tipo, t.primeiraVezEm)
      .where(sql`${t.status} = 'pendente'`),
  ],
);

/** Itens do cadastro a que o aviso se refere (selo na lista e no painel, atalho do aviso). */
export const avisosEntidades = pgTable(
  'avisos_entidades',
  {
    avisoId: uuid('aviso_id')
      .notNull()
      .references(() => avisosCadastro.id, { onDelete: 'cascade' }),
    /** Entidade no singular, como na auditoria: `cliente`, `medico`, `exame`, `preco_cliente`... */
    entidade: text('entidade').notNull(),
    entidadeId: uuid('entidade_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.avisoId, t.entidade, t.entidadeId] }),
    index('avisos_entidades_entidade_idx').on(t.entidade, t.entidadeId),
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
    /** Minutos entre duas importações automáticas da MobileMed (o RPA antigo: 30); nulo = desligada. */
    mobilemedIntervaloMinutos: integer('mobilemed_intervalo_minutos').default(15),
    /** O período começa no dia 1º de tantos meses atrás: 1 = do mês anterior até hoje. */
    mobilemedMesesAnteriores: integer('mobilemed_meses_anteriores').notNull().default(1),
    /** Dias de cada chamada ao relatório (a que vier no teto é refeita em metades). */
    mobilemedJanelaDias: integer('mobilemed_janela_dias').notNull().default(7),
    /** Itens por chamada a partir dos quais a lista da MobileMed é tida como cortada. */
    mobilemedTeto: integer('mobilemed_teto').notNull().default(50_000),
    /**
     * Unidades de destino cujo compartilhamento entra (o RPA só baixava CRD_APOIO); vazia, o
     * compartilhamento não é importado.
     */
    mobilemedCompartilhamentoUnidades: text('mobilemed_compartilhamento_unidades')
      .array()
      .notNull()
      .default(sql`ARRAY['CRD_APOIO']::text[]`),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [check('parametros_ingestao_unica', sql`${t.id} = 1`)],
);
