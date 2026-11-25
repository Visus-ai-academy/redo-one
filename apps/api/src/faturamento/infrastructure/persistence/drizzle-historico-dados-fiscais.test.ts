import { resolve } from 'node:path';

import { inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleHistoricoDadosFiscais } from './drizzle-historico-dados-fiscais';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleHistoricoDadosFiscais', () => {
  let pool: Pool;
  let db: Database;
  let leitor: DrizzleHistoricoDadosFiscais;
  let anaId: string;
  // Ids próprios: os eventos são apagados por eles no fim.
  const clienteId = crypto.randomUUID();
  const outroClienteId = crypto.randomUUID();
  const eventoIds: string[] = [];

  const evento = async (valores: Partial<typeof schema.eventosAuditoria.$inferInsert>) => {
    const [e] = await db
      .insert(schema.eventosAuditoria)
      .values({
        ocorridoEm: new Date('2026-11-20T10:00:00Z'),
        atorTipo: 'usuario',
        atorId: anaId,
        entidade: 'cliente_dados_fiscais',
        entidadeId: clienteId,
        acao: 'alterado',
        antes: { cidade: null },
        depois: { cidade: 'Santos' },
        ...valores,
      })
      .returning({ id: schema.eventosAuditoria.id });
    eventoIds.push(e?.id ?? '');
    return e?.id ?? '';
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    leitor = new DrizzleHistoricoDadosFiscais(db);
    const [u] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Ana', email: `historico-fiscal-${Math.random()}@exemplo.com` })
      .returning();
    anaId = u?.id ?? '';
  });

  afterAll(async () => {
    if (eventoIds.length) {
      await db
        .delete(schema.eventosAuditoria)
        .where(inArray(schema.eventosAuditoria.id, eventoIds));
    }
    await db.delete(schema.usuarios).where(sql`${schema.usuarios.email} like 'historico-fiscal-%'`);
    await pool.end();
  });

  it('só os eventos dos dados fiscais do cliente, do mais novo, com o nome de quem fez', async () => {
    const antigo = await evento({ ocorridoEm: new Date('2026-11-20T10:00:00Z') });
    const novo = await evento({
      ocorridoEm: new Date('2026-11-22T10:00:00Z'),
      antes: { emailsNf: ['a@x.com'] },
      depois: { emailsNf: ['a@x.com', 'b@x.com'] },
    });
    const doSistema = await evento({
      ocorridoEm: new Date('2026-11-21T10:00:00Z'),
      atorTipo: 'sistema',
      atorId: null,
    });
    // Fora: outro cliente e o cadastro do cliente (catálogo).
    await evento({ entidadeId: outroClienteId });
    await evento({ entidade: 'cliente', ocorridoEm: new Date('2026-11-23T10:00:00Z') });

    const pagina = await leitor.listar(clienteId, { pagina: 1, porPagina: 2 });
    expect(pagina.total).toBe(3);
    expect(pagina.itens).toEqual([
      {
        id: novo,
        clienteId,
        ocorridoEm: new Date('2026-11-22T10:00:00Z'),
        ator: { tipo: 'usuario', nome: 'Ana' },
        acao: 'alterado',
        antes: { emailsNf: ['a@x.com'] },
        depois: { emailsNf: ['a@x.com', 'b@x.com'] },
      },
      expect.objectContaining({ id: doSistema, ator: { tipo: 'sistema', nome: null } }),
    ]);
    const segunda = await leitor.listar(clienteId, { pagina: 2, porPagina: 2 });
    expect(segunda.itens.map((i) => i.id)).toEqual([antigo]);
  });
});
