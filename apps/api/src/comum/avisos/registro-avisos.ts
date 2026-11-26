import type { Database } from '../../database/database';

/**
 * Tipos de aviso (Operação › Avisos). Cada um tem uma linha em `tipos_aviso` (responsáveis e
 * "impede fechar a competência"); tipo novo entra aqui e numa migration que cria a linha.
 */
export const TIPOS_AVISO = [
  'cliente',
  'medico',
  'estudo',
  'modalidade',
  'especialidade',
  'prioridade',
  /** Grafia sem de-para nas prioridades da operação, vista pela rodada da distribuição. */
  'prioridade_operacao',
  /** Médico escalado sem conta liberada na unidade do exame na MobileMed, visto pela rodada. */
  'conta_unidade',
  /** Nome da MobileMed que casa com mais de um cliente (o laudo fica sem cliente). */
  'cliente_ambiguo',
  /** Mesmo arranjo, faixa e vigência com valores diferentes no dashboards-one; vale o mais recente. */
  'preco_repetido',
  /** Item do catálogo (categoria, prioridade...) que a carga do dashboards-one criou. */
  'catalogo_criado_carga',
  /** Cliente inativo no cadastro com exames na fila: o robô não os distribui (leitura da fila). */
  'cliente_inativo',
] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];

/** Quem encontrou a inconsistência. */
export const ORIGENS_AVISO = ['importacao', 'rodada', 'carga', 'tela', 'job'] as const;
export type OrigemAviso = (typeof ORIGENS_AVISO)[number];

/**
 * Item do cadastro a que o aviso se refere: dá o selo na lista e no painel dele e o atalho do
 * aviso. `tipo` é a entidade no singular, como na auditoria (`cliente`, `medico`, `exame`,
 * `preco_cliente`, `preco_padrao_contratado`, `categoria`...).
 */
export interface EntidadeAviso {
  tipo: string;
  id: string;
}

/** Início para o que vale desde sempre (ex.: preço sem início de vigência). */
export const COMPETENCIA_DESDE_SEMPRE = '0001-01';

/** Competências "AAAA-MM" a que o aviso se liga (a trava do fechamento); `ate` nulo = em diante. */
export interface CompetenciasAviso {
  desde: string;
  ate: string | null;
}

export interface AvisoLevantado {
  tipo: TipoAviso;
  /** Identidade do aviso no tipo: a mesma chave é o mesmo aviso (deduplicação). */
  chave: string;
  /** Texto para a pessoa: o que está errado, como chegou. */
  valor: string;
  /**
   * Nomes citados pelo aviso, para a tela mostrar em lista em vez de dentro do texto (ex.: as
   * tabelas de preço que usam o item criado pela carga). Ausente = nenhum.
   */
  itens?: readonly string[];
  /** Quantas vezes apareceu nesta verificação (laudos, exames, linhas). */
  ocorrencias: number;
  entidades?: readonly EntidadeAviso[];
  competencias?: CompetenciasAviso | null;
}

/** O que faz a verificação: o `db` ou o `tx` da transação de quem verifica. */
export type ExecutorAvisos = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export const REGISTRO_AVISOS = Symbol('REGISTRO_AVISOS');

/**
 * Porta para qualquer contexto abrir e resolver avisos, na transação dele (passando o `tx`).
 * Sempre idempotente: a mesma chave é um aviso só; o ignorado segue ignorado; o resolvido que volta
 * a aparecer reabre.
 */
export interface RegistroAvisos {
  /**
   * Abre ou atualiza os avisos levantados e resolve os pendentes conferidos (a causa sumiu). Para
   * origens que veem só parte dos casos a cada vez (a importação vê só os laudos do arquivo).
   */
  registrar(
    executor: ExecutorAvisos,
    entrada: {
      origem: OrigemAviso;
      importacaoId?: string | null;
      levantados: readonly AvisoLevantado[];
      conferidos: readonly { tipo: TipoAviso; chave: string }[];
      agora: Date;
    },
  ): Promise<void>;
  /**
   * Verificação completa de um tipo (a carga confere todos os preços): abre ou atualiza os
   * levantados e resolve os pendentes desse tipo e origem que não vieram.
   */
  sincronizar(
    executor: ExecutorAvisos,
    entrada: {
      tipo: TipoAviso;
      origem: OrigemAviso;
      levantados: readonly AvisoLevantado[];
      agora: Date;
    },
  ): Promise<void>;
  /** A causa sumiu nestes itens (ex.: o preço foi corrigido na tela): resolve os pendentes deles. */
  resolverDasEntidades(
    executor: ExecutorAvisos,
    entrada: { tipos: readonly TipoAviso[]; entidades: readonly EntidadeAviso[]; agora: Date },
  ): Promise<void>;
}
