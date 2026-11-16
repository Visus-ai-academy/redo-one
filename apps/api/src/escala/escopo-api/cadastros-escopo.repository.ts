export const CADASTROS_ESCOPO_REPOSITORY = Symbol('CADASTROS_ESCOPO_REPOSITORY');

export interface Referencia {
  id: string;
  nome: string;
}

/** O que o recorte consulta nos cadastros: o usuário e os nomes dos turnos e frentes. */
export interface CadastrosEscopoRepository {
  usuarioExiste(id: string): Promise<boolean>;
  /** Só os que existem, na ordem da escala. */
  turnos(ids: string[]): Promise<Referencia[]>;
  /** Só as que existem, na ordem da escala; o nome é o rótulo da frente. */
  frentes(ids: string[]): Promise<Referencia[]>;
}
