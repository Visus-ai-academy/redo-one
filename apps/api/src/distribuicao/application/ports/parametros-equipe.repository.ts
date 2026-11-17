export const PARAMETROS_EQUIPE_REPOSITORY = Symbol('PARAMETROS_EQUIPE_REPOSITORY');

/**
 * Como o robô usa o recorte dos arranjos da equipe. A flag mora no cadastro da equipe
 * (`equipes.plantao`), mas só a distribuição a lê e a edita.
 */
export interface ParametrosEquipe {
  /**
   * Falso: o recorte vai só para os membros (direcionar). Verdadeiro: o robô não o entrega a
   * ninguém; fica para o plantão laudar à mão.
   */
  plantao: boolean;
}

export interface ParametrosEquipeRepository {
  /** Null = a equipe não existe. */
  obter(equipeId: string): Promise<ParametrosEquipe | null>;
  salvar(equipeId: string, parametros: ParametrosEquipe): Promise<void>;
}
