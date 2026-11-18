import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { asc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { existePermissao, normalizarPermissoes } from './catalogo';

// Roda contra um Postgres de verdade. Sem TEST_DATABASE_URL, aparece como "skipped".
const url = process.env.TEST_DATABASE_URL;
const pasta = resolve(__dirname, '../../../drizzle');

describe.skipIf(!url)('migração 0020: aba Distribuição do cliente com chave própria', () => {
  let pool: Pool;
  let db: Database;
  const comandos = readFileSync(resolve(pasta, '0020_permissoes_distribuicao_cliente.sql'), 'utf8')
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

  /** O que o papel ganha além do que já tinha. */
  async function ganhou(permissoes: string[]) {
    const id = await papel('Papel', permissoes);
    await rodarMigracao();
    return (await permissoesDe(id)).filter((p) => !permissoes.includes(p));
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

  it('quem vê clientes continua vendo a aba Distribuição', async () => {
    expect(await ganhou(['clientes.ver'])).toEqual(['clientes.distribuicao.ver']);
  });

  it('editar clientes não dá editar a prioridade', async () => {
    expect(await ganhou(['clientes.ver', 'clientes.editar'])).toEqual([
      'clientes.distribuicao.ver',
    ]);
  });

  it('sem clientes.ver, nada novo; roda duas vezes com o mesmo resultado, normalizado', async () => {
    expect(await ganhou(['medicos.ver'])).toEqual([]);
    const gestao = await papel('Gestão', ['clientes.ver', 'clientes.criar', 'escala.ver']);
    await rodarMigracao();
    const depois = await permissoesDe(gestao);
    await rodarMigracao();
    expect(await permissoesDe(gestao)).toEqual(depois);
    expect(depois).toEqual(
      ['clientes.criar', 'clientes.distribuicao.ver', 'clientes.ver', 'escala.ver'].sort(),
    );
    expect(depois.every(existePermissao)).toBe(true);
    expect(normalizarPermissoes(depois)).toEqual(depois);
  });
});
