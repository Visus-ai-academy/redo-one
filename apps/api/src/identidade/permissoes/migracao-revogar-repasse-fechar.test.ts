import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { asc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { existePermissao } from './catalogo';

// Roda contra um Postgres de verdade. Sem TEST_DATABASE_URL, aparece como "skipped".
const url = process.env.TEST_DATABASE_URL;
const pasta = resolve(__dirname, '../../../drizzle');

describe.skipIf(!url)(
  'migração 0116: a permissão repasse.fechar sai (o fechamento é único)',
  () => {
    let pool: Pool;
    let db: Database;
    const comandos = readFileSync(resolve(pasta, '0116_revogar_repasse_fechar.sql'), 'utf8')
      .split('--> statement-breakpoint')
      .map((c) => c.trim())
      .filter(Boolean);

    async function rodarMigracao() {
      for (const comando of comandos) await db.execute(sql.raw(comando));
    }

    async function papel(nome: string, permissoes: string[]) {
      const [criado] = await db.insert(schema.papeis).values({ nome }).returning();
      if (!criado) throw new Error('o insert não devolveu o papel');
      if (permissoes.length) {
        await db
          .insert(schema.papeisPermissoes)
          .values(permissoes.map((permissao) => ({ papelId: criado.id, permissao })));
      }
      return criado.id;
    }

    async function permissoesDe(papelId: string) {
      const linhas = await db
        .select({ permissao: schema.papeisPermissoes.permissao })
        .from(schema.papeisPermissoes)
        .where(eq(schema.papeisPermissoes.papelId, papelId))
        .orderBy(asc(schema.papeisPermissoes.permissao));
      return linhas.map((l) => l.permissao);
    }

    beforeAll(async () => {
      pool = new Pool({ connectionString: url });
      db = drizzle({ client: pool, schema });
      await migrate(db, { migrationsFolder: pasta });
    });

    afterAll(async () => {
      await pool.end();
    });

    beforeEach(async () => {
      await db.execute(sql`truncate table papeis_permissoes, papeis cascade`);
    });

    it('tira repasse.fechar de todo papel; o resto do papel fica; roda duas vezes igual', async () => {
      const financeiro = await papel('Financeiro', [
        'faturamento.ver',
        'repasse.fechar',
        'repasse.recalcular',
        'repasse.ver',
      ]);
      const sem = await papel('Sem', ['repasse.ver']);
      await rodarMigracao();
      await rodarMigracao();
      const depois = await permissoesDe(financeiro);
      expect(depois).toEqual(['faturamento.ver', 'repasse.recalcular', 'repasse.ver']);
      expect(depois.every(existePermissao)).toBe(true);
      expect(await permissoesDe(sem)).toEqual(['repasse.ver']);
    });
  },
);
