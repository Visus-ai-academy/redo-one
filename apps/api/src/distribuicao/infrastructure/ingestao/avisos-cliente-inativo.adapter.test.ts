import { resolve } from 'node:path';

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleRegistroAvisos } from '../../../ingestao/infrastructure/persistence/drizzle-registro-avisos';
import { resolverAvisoAoReativarCliente } from '../catalogo/gatilhos-distribuicao.module';
import { AvisosClienteInativoAdapter } from './avisos-cliente-inativo.adapter';

const url = process.env.TEST_DATABASE_URL;
const agora = new Date('2026-11-26T12:00:00Z');
const CLI = '0195f0a0-0000-7000-8000-000000000001';
const OUTRO = '0195f0a0-0000-7000-8000-000000000002';

describe.skipIf(!url)('avisos de cliente inativo (banco)', () => {
  let pool: Pool;
  let db: Database;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table avisos_cadastro cascade`);
  });

  afterAll(async () => {
    await pool.end();
  });

  const doTipo = () =>
    db
      .select()
      .from(schema.avisosCadastro)
      .where(eq(schema.avisosCadastro.tipo, 'cliente_inativo'));

  it('um aviso por cliente, ligado ao cliente, com os exames em itens; some da fila, resolve', async () => {
    const avisos = new AvisosClienteInativoAdapter(db);
    await avisos.sincronizar(
      [{ clienteId: CLI, nome: 'HOSPITAL A', exames: 2, itens: ['TC · exame 1', 'RM · exame 2'] }],
      agora,
    );
    const [a] = await doTipo();
    expect(a).toMatchObject({
      chave: CLI,
      valor: 'HOSPITAL A está inativo: os exames dele na fila não estão sendo distribuídos',
      itens: ['TC · exame 1', 'RM · exame 2'],
      ocorrencias: 2,
      origem: 'rodada',
      status: 'pendente',
    });
    const entidades = await db.select().from(schema.avisosEntidades);
    expect(entidades).toMatchObject([{ avisoId: a?.id, entidade: 'cliente', entidadeId: CLI }]);

    await avisos.sincronizar([], new Date(agora.getTime() + 60_000));
    expect((await doTipo())[0]?.status).toBe('resolvido');
  });

  it('reativar o cliente resolve o aviso dele na hora; o de outro cliente segue pendente', async () => {
    const avisos = new AvisosClienteInativoAdapter(db);
    await avisos.sincronizar(
      [
        { clienteId: CLI, nome: 'HOSPITAL A', exames: 1, itens: ['TC · exame 1'] },
        { clienteId: OUTRO, nome: 'HOSPITAL B', exames: 1, itens: ['RM · exame 2'] },
      ],
      agora,
    );

    const reativado = resolverAvisoAoReativarCliente(new DrizzleRegistroAvisos(), () => agora);
    await db.transaction((tx) => reativado.aoReativar(tx, CLI));

    const status = Object.fromEntries((await doTipo()).map((a) => [a.chave, a.status]));
    expect(status).toEqual({ [CLI]: 'resolvido', [OUTRO]: 'pendente' });

    // Desativado de novo, a leitura seguinte o encontra: o mesmo aviso reabre.
    await avisos.sincronizar(
      [{ clienteId: CLI, nome: 'HOSPITAL A', exames: 1, itens: ['TC · exame 1'] }],
      new Date(agora.getTime() + 60_000),
    );
    expect((await doTipo()).find((a) => a.chave === CLI)?.status).toBe('pendente');
  });
});
