export const CLASSIFICACOES_ESCALA_REPOSITORY = Symbol('CLASSIFICACOES_ESCALA_REPOSITORY');

/** O mínimo da prioridade do catálogo para marcar na alocação: a gestora não tem `catalogo.ver`. */
export interface PrioridadeEscala {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface SubespecialidadeEscala extends PrioridadeEscala {
  /** Especialidades a que pertence: a alocação só oferece as da especialidade da frente. */
  especialidadeIds: string[];
}

export interface ClassificacoesEscala {
  prioridades: PrioridadeEscala[];
  subespecialidades: SubespecialidadeEscala[];
}

export interface ClassificacoesEscalaRepository {
  /** Listas inteiras (são curtas), inativas inclusive, na ordem do catálogo (ordem e nome). */
  listar(): Promise<ClassificacoesEscala>;
}
