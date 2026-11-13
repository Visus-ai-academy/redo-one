import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../database/database';
import { papeis, papeisPermissoes } from '../../database/schema';
import type { AcessoDoPapel, PapeisRepository } from './papeis.repository';

@Injectable()
export class DrizzlePapeisRepository implements PapeisRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async acessoDoPapel(papelId: string): Promise<AcessoDoPapel> {
    const [papel] = await this.db
      .select({ acessoTotal: papeis.acessoTotal })
      .from(papeis)
      .where(eq(papeis.id, papelId))
      .limit(1);
    if (!papel) return { acessoTotal: false, permissoes: [] };
    if (papel.acessoTotal) return { acessoTotal: true, permissoes: [] };

    const linhas = await this.db
      .select({ permissao: papeisPermissoes.permissao })
      .from(papeisPermissoes)
      .where(eq(papeisPermissoes.papelId, papelId));
    return { acessoTotal: false, permissoes: linhas.map((l) => l.permissao) };
  }
}
