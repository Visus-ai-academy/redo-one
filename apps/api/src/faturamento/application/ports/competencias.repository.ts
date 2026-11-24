export const COMPETENCIAS_REPOSITORY = Symbol('COMPETENCIAS_REPOSITORY');

export interface CompetenciasRepository {
  /** Fechadas ou com a importação travada ("YYYY-MM"). */
  listarBloqueadas(): Promise<string[]>;
  /** Cria como aberta as que ainda não têm linha; as que já existem ficam como estão. */
  garantir(competencias: string[]): Promise<void>;
}
