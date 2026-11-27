import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { asc, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleRegistroAvisos } from '../../../ingestao/infrastructure/persistence/drizzle-registro-avisos';
import type { NovaGeracao } from '../../application/ports/geracoes-repasse';
import type { DemonstrativoCalculado } from '../../domain/demonstrativo';
import { AvisosDaGeracao } from './avisos-da-geracao';

const url = process.env.TEST_DATABASE_URL;

/** Demonstrativo só com o que os avisos leem: o médico e os grupos sem preço. */
const semPreco = (medicoId: string, modalidadeId: string): DemonstrativoCalculado =>
  ({
    medicoId,
    grupos: [
      {
        origem: 'sem_preco',
        modalidadeId,
        especialidadeId: null,
        categoriaId: null,
        prioridadeId: null,
        clienteId: null,
        unidadeId: null,
        laudos: [{}],
      },
    ],
  }) as unknown as DemonstrativoCalculado;

const geracao = (geradoEm: Date, demonstrativos: DemonstrativoCalculado[]): NovaGeracao => ({
  competencia: '2026-11',
  tipo: 'previa',
  recalculoId: null,
  reabertaEm: null,
  geradoEm,
  geradoPorId: null,
  demonstrativos,
});

describe.skipIf(!url)('AvisosDaGeracao', () => {
  let pool: Pool;
  let db: Database;
  const avisos = new AvisosDaGeracao(new DrizzleRegistroAvisos());

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

  it('nova geração: o que continua sem preço segue pendente; o que ganhou preço se resolve', async () => {
    const [medico, continua, ganhouPreco] = [randomUUID(), randomUUID(), randomUUID()];
    const primeira = new Date('2026-11-25T12:00:00Z');
    const segunda = new Date('2026-11-26T12:00:00Z');
    await db.transaction((tx) =>
      avisos.registrar(
        tx,
        geracao(primeira, [semPreco(medico, continua), semPreco(medico, ganhouPreco)]),
      ),
    );

    await db.transaction((tx) =>
      avisos.registrar(tx, geracao(segunda, [semPreco(medico, continua)])),
    );

    const linhas = await db
      .select()
      .from(schema.avisosCadastro)
      .orderBy(asc(schema.avisosCadastro.chave));
    const porModalidade = Object.fromEntries(
      linhas.map((a) => [a.chave.split('|')[2], [a.status, a.ultimaVezEm, a.decididoEm]]),
    );
    expect(porModalidade).toEqual({
      [continua]: ['pendente', segunda, null],
      [ganhouPreco]: ['resolvido', primeira, segunda],
    });
  });
});
