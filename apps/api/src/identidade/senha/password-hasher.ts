/** Token de injeção do hash de senha. */
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface PasswordHasher {
  hash(senha: string): Promise<string>;
  /** `false` também para hash malformado: quem chama só precisa saber se a senha confere. */
  verify(hash: string, senha: string): Promise<boolean>;
}
