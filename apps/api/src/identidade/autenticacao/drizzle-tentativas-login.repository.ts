import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { tentativasLogin } from '../../database/schema';
import type { TentativaLogin, TentativasLoginRepository } from './tentativas-login.repository';

@Injectable()
export class DrizzleTentativasLoginRepository implements TentativasLoginRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async registrar(tentativa: TentativaLogin) {
    await this.db.insert(tentativasLogin).values({
      ip: tentativa.ip,
      usuarioId: tentativa.usuarioId,
      sucesso: tentativa.sucesso,
      userAgent: tentativa.userAgent,
      criadoEm: tentativa.em,
    });
  }

  // Usa o índice (ip, criado_em).
  async contarFalhasPorIp(ip: string, desde: Date) {
    const [linha] = await this.db
      .select({ total: count() })
      .from(tentativasLogin)
      .where(
        and(
          eq(tentativasLogin.ip, ip),
          eq(tentativasLogin.sucesso, false),
          gte(tentativasLogin.criadoEm, desde),
        ),
      );
    return linha?.total ?? 0;
  }
}
