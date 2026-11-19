import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { usuarios } from '../../database/schema';
import type { IdentificadorLogin, UsuarioLogin, UsuariosRepository } from './usuarios.repository';

@Injectable()
export class DrizzleUsuariosRepository implements UsuariosRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async buscarParaLogin(identificador: IdentificadorLogin): Promise<UsuarioLogin | null> {
    const filtro =
      'email' in identificador
        ? eq(usuarios.email, identificador.email)
        : eq(usuarios.cpf, identificador.cpf);
    const [usuario] = await this.db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        email: usuarios.email,
        senhaHash: usuarios.senhaHash,
        ativo: usuarios.ativo,
        tentativasFalhas: usuarios.tentativasFalhas,
        bloqueadoAte: usuarios.bloqueadoAte,
      })
      .from(usuarios)
      .where(filtro)
      .limit(1);
    return usuario ?? null;
  }

  async registrarFalha(id: string, tentativasFalhas: number, bloqueadoAte: Date | null) {
    await this.db
      .update(usuarios)
      .set({ tentativasFalhas, bloqueadoAte })
      .where(eq(usuarios.id, id));
  }

  async registrarSucesso(id: string) {
    await this.db
      .update(usuarios)
      .set({ tentativasFalhas: 0, bloqueadoAte: null })
      .where(eq(usuarios.id, id));
  }
}
