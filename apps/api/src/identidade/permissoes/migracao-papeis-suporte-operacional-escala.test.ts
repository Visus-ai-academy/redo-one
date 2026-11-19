import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { asc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';

// Roda contra um Postgres de verdade. Sem TEST_DATABASE_URL, aparece como "skipped".
const url = process.env.TEST_DATABASE_URL;
const pasta = resolve(__dirname, '../../../drizzle');

describe.skipIf(!url)(
  'migração 0042: papéis Suporte, Operacional e Gestão de escala médica',
  () => {
    let pool: Pool;
    let db: Database;
    const comandos = readFileSync(
      resolve(pasta, '0042_papeis_suporte_operacional_escala.sql'),
      'utf8',
    )
      .split('--> statement-breakpoint')
      .map((c) => c.trim())
      .filter(Boolean);

    async function rodarMigracao() {
      for (const comando of comandos) await db.execute(sql.raw(comando));
    }

    async function papeis() {
      const linhas = await db
        .select({ id: schema.papeis.id, nome: schema.papeis.nome })
        .from(schema.papeis)
        .orderBy(asc(schema.papeis.nome));
      return Promise.all(
        linhas.map(async ({ id, nome }) => {
          const permissoes = await db
            .select({ permissao: schema.papeisPermissoes.permissao })
            .from(schema.papeisPermissoes)
            .where(eq(schema.papeisPermissoes.papelId, id))
            .orderBy(asc(schema.papeisPermissoes.permissao));
          return { id, nome, permissoes: permissoes.map((p) => p.permissao) };
        }),
      );
    }

    async function eventos() {
      return db
        .select({
          entidadeId: schema.eventosAuditoria.entidadeId,
          acao: schema.eventosAuditoria.acao,
          atorTipo: schema.eventosAuditoria.atorTipo,
          antes: schema.eventosAuditoria.antes,
          depois: schema.eventosAuditoria.depois,
        })
        .from(schema.eventosAuditoria)
        .where(eq(schema.eventosAuditoria.entidade, 'papel'));
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
      await db.execute(sql`truncate table eventos_auditoria, papeis_permissoes, papeis cascade`);
    });

    it('banco novo: cria os três papéis, só o Operacional com distribuicao.ver', async () => {
      await rodarMigracao();
      expect((await papeis()).map(({ nome, permissoes }) => ({ nome, permissoes }))).toEqual([
        { nome: 'Gestão de escala médica', permissoes: [] },
        { nome: 'Operacional', permissoes: ['distribuicao.ver'] },
        { nome: 'Suporte', permissoes: [] },
      ]);
      const criados = (await eventos()).filter((e) => e.acao === 'criado');
      expect(criados).toHaveLength(3);
      expect(criados.every((e) => e.atorTipo === 'sistema')).toBe(true);
    });

    it('renomeia a Gestora de Escala sem trocar o id nem as permissões, e audita', async () => {
      const [gestora] = await db
        .insert(schema.papeis)
        .values({ nome: 'Gestora de Escala' })
        .returning();
      const [operacional] = await db
        .insert(schema.papeis)
        .values({ nome: 'Operacional' })
        .returning();
      if (!gestora || !operacional) throw new Error('insert não devolveu o papel');
      await db.insert(schema.papeisPermissoes).values([
        { papelId: gestora.id, permissao: 'escala.ver' },
        { papelId: operacional.id, permissao: 'clientes.ver' },
      ]);

      await rodarMigracao();

      expect(await papeis()).toEqual([
        { id: gestora.id, nome: 'Gestão de escala médica', permissoes: ['escala.ver'] },
        {
          id: operacional.id,
          nome: 'Operacional',
          permissoes: ['clientes.ver', 'distribuicao.ver'],
        },
        { id: expect.any(String), nome: 'Suporte', permissoes: [] },
      ]);
      const registrados = await eventos();
      expect(registrados).toContainEqual({
        entidadeId: gestora.id,
        acao: 'alterado',
        atorTipo: 'sistema',
        antes: { nome: 'Gestora de Escala' },
        depois: { nome: 'Gestão de escala médica' },
      });
      expect(registrados).toContainEqual({
        entidadeId: operacional.id,
        acao: 'alterado',
        atorTipo: 'sistema',
        antes: { permissoes: ['clientes.ver'] },
        depois: { permissoes: ['clientes.ver', 'distribuicao.ver'] },
      });
      expect(registrados.filter((e) => e.acao === 'criado')).toHaveLength(1);
    });

    it('roda duas vezes com o mesmo resultado e sem auditar de novo', async () => {
      await rodarMigracao();
      const depois = await papeis();
      const eventosDepois = await eventos();
      await rodarMigracao();
      expect(await papeis()).toEqual(depois);
      expect(await eventos()).toHaveLength(eventosDepois.length);
    });
  },
);
