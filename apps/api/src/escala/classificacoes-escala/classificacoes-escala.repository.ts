export const CLASSIFICACOES_ESCALA_REPOSITORY = Symbol('CLASSIFICACOES_ESCALA_REPOSITORY');

/**
 * Prioridade da operação (cadastro da distribuição, Configurações › Distribuição) para marcar na
 * alocação: o recorte de prioridade é por elas desde 19/11/2026. A escala só lê a tabela da
 * distribuição (id, nome e cor), como lê o catálogo; a gestora não tem `configuracoes.ver`.
 */
export interface PrioridadeEscala {
  id: string;
  nome: string;
  /** Hex `#RRGGBB`; null = neutra. */
  cor: string | null;
}

export interface SubespecialidadeEscala {
  id: string;
  nome: string;
  ativo: boolean;
  /** Especialidades a que pertence: a alocação só oferece as da especialidade da frente. */
  especialidadeIds: string[];
}

export interface ClassificacoesEscala {
  prioridades: PrioridadeEscala[];
  subespecialidades: SubespecialidadeEscala[];
}

export interface ClassificacoesEscalaRepository {
  /**
   * Listas inteiras (são curtas): as prioridades da operação pela posição e nome; as
   * subespecialidades, inativas inclusive, na ordem do catálogo (ordem e nome).
   */
  listar(): Promise<ClassificacoesEscala>;
}
