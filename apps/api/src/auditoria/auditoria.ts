/** Token de injeção do registro de auditoria. */
export const AUDITORIA = Symbol('AUDITORIA');

/** Quem fez a ação: uma pessoa, um robô (chave de API) ou o próprio sistema (job, cron). */
export type Ator = { tipo: 'usuario' | 'robo'; id: string } | { tipo: 'sistema'; id?: undefined };

export interface EventoAuditoria {
  ator: Ator;
  /** Tabela ou conceito afetado, no singular: `usuario`, `papel`, `chave_robo`, `competencia`. */
  entidade: string;
  entidadeId: string;
  /** Verbo no particípio: `convidado`, `papel_trocado`, `desbloqueado`, `revogada`. */
  acao: string;
  /** Só os campos que mudaram. Nunca senha, hash ou token. */
  antes?: Record<string, unknown>;
  depois?: Record<string, unknown>;
  em: Date;
}

export interface Auditoria {
  registrar(evento: EventoAuditoria): Promise<void>;
}
