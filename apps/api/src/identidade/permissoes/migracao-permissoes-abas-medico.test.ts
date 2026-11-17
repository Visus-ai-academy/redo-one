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

describe.skipIf(!url)(
  'migração 0016: abas Distribuição e Acesso do médico com chave própria',
  () => {
    let pool: Pool;
    let db: Database;
    const comandos = readFileSync(resolve(pasta, '0016_permissoes_abas_medico.sql'), 'utf8')
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

    it('quem vê médicos continua vendo a aba Distribuição', async () => {
      expect(await ganhou(['medicos.ver'])).toEqual(['medicos.distribuicao.ver']);
    });

    it('quem vê médicos e usuários continua vendo a aba Acesso', async () => {
      expect(await ganhou(['medicos.ver', 'usuarios.ver'])).toEqual([
        'medicos.acesso.ver',
        'medicos.distribuicao.ver',
      ]);
    });

    it.each([['usuarios.criar'], ['usuarios.editar']])(
      'quem vê médicos e tem %s continua convidando ou ligando a conta pela aba Acesso',
      async (chave) => {
        expect(await ganhou(['medicos.ver', 'usuarios.ver', chave])).toEqual([
          'medicos.acesso.editar',
          'medicos.acesso.ver',
          'medicos.distribuicao.ver',
        ]);
      },
    );

    it('sem medicos.ver, as chaves de usuários não dão nada novo', async () => {
      expect(await ganhou(['usuarios.ver', 'usuarios.criar', 'usuarios.editar'])).toEqual([]);
    });

    it('não mexe no resto, roda duas vezes com o mesmo resultado e deixa o papel normalizado', async () => {
      const gestao = await papel('Gestão', [
        'medicos.ver',
        'medicos.editar',
        'medicos.distribuicao.editar',
        'usuarios.ver',
        'usuarios.criar',
        'escala.ver',
      ]);
      const leitura = await papel('Só leitura', ['clientes.ver', 'volumetria.ver']);
      const vazio = await papel('Vazio', []);

      await rodarMigracao();
      const depois = await permissoesDe(gestao);
      await rodarMigracao();

      expect(depois).toEqual(
        [
          'escala.ver',
          'medicos.acesso.editar',
          'medicos.acesso.ver',
          'medicos.distribuicao.editar',
          'medicos.distribuicao.ver',
          'medicos.editar',
          'medicos.ver',
          'usuarios.criar',
          'usuarios.ver',
        ].sort(),
      );
      expect(await permissoesDe(gestao)).toEqual(depois);
      expect(depois.every(existePermissao)).toBe(true);
      expect(normalizarPermissoes(depois)).toEqual(depois);
      expect(await permissoesDe(leitura)).toEqual(['clientes.ver', 'volumetria.ver']);
      expect(await permissoesDe(vazio)).toEqual([]);
    });
  },
);
