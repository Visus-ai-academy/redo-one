export const PAPEIS_SISTEMA_REPOSITORY = Symbol('PAPEIS_SISTEMA_REPOSITORY');

/** Papéis fixos que o One precisa para funcionar, criados pelo comando `admin:criar`. */
export interface PapeisSistemaRepository {
  /** Cria Administrador (acesso total) e Médico se faltarem; devolve o id do Administrador. */
  garantir(): Promise<{ administradorId: string }>;
  existeAdministrador(): Promise<boolean>;
}
