import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

import type { PasswordHasher } from './password-hasher';

// Parâmetros do OWASP Password Storage Cheat Sheet para Argon2id (19 MiB, 2 passadas, 1 thread).
// O algoritmo padrão do @node-rs/argon2 já é o Argon2id; o enum dele é `const enum` e não passa pelo SWC.
const OPCOES = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  hash(senha: string): Promise<string> {
    return hash(senha, OPCOES);
  }

  async verify(hashGuardado: string, senha: string): Promise<boolean> {
    try {
      return await verify(hashGuardado, senha);
    } catch {
      return false;
    }
  }
}
