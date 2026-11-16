export const MEDICO_DO_USUARIO_REPOSITORY = Symbol('MEDICO_DO_USUARIO_REPOSITORY');

/** O médico vinculado à conta (portal); o `PrincipalUsuario` não o traz. */
export interface MedicoDoUsuarioRepository {
  /** `null` = conta sem médico vinculado. */
  doUsuario(usuarioId: string): Promise<string | null>;
}
