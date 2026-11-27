import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { asc, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AvisoLevantado } from '../../../comum/avisos/registro-avisos';
import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleRegistroAvisos } from './drizzle-registro-avisos';

const url = process.env.TEST_DATABASE_URL;
const agora = new Date('2026-11-25T12:00:00Z');

const preco = (chave: string, valor: string, entidadeId: string): AvisoLevantado => ({
  tipo: 'preco_repetido',
  chave,
  valor,
  ocorrencias: 2,
  entidades: [
    { tipo: 'preco_cliente', id: entidadeId },
    { tipo: 'cliente', id: entidadeId },
  ],
  competencias: { desde: '2026-01', ate: null },
});

describe.skipIf(!url)('DrizzleRegistroAvisos', () => {
  let pool: Pool;
  let db: Database;
  const registro = new DrizzleRegistroAvisos();

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

  const avisos = () =>
    db.select().from(schema.avisosCadastro).orderBy(asc(schema.avisosCadastro.chave));
  const entidades = () =>
    db
      .select({
        chave: schema.avisosCadastro.chave,
        entidade: schema.avisosEntidades.entidade,
        id: schema.avisosEntidades.entidadeId,
      })
      .from(schema.avisosEntidades)
      .innerJoin(schema.avisosCadastro, sql`${schema.avisosCadastro.id} = aviso_id`)
      .orderBy(schema.avisosCadastro.chave, schema.avisosEntidades.entidade);

  it('registra origem, competências e entidades; a próxima vez troca as entidades', async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    await registro.registrar(db, {
      origem: 'carga',
      levantados: [preco('p1', 'Preço 1', a)],
      conferidos: [],
      agora,
    });
    await registro.registrar(db, {
      origem: 'carga',
      levantados: [
        { ...preco('p1', 'Preço 1b', b), competencias: { desde: '2026-03', ate: '2026-05' } },
      ],
      conferidos: [],
      agora,
    });

    expect(await avisos()).toEqual([
      expect.objectContaining({
        tipo: 'preco_repetido',
        chave: 'p1',
        valor: 'Preço 1b',
        origem: 'carga',
        competenciaDesde: '2026-03',
        competenciaAte: '2026-05',
        status: 'pendente',
      }),
    ]);
    expect(await entidades()).toEqual([
      { chave: 'p1', entidade: 'cliente', id: b },
      { chave: 'p1', entidade: 'preco_cliente', id: b },
    ]);
  });

  it('grava os itens citados; a próxima vez os troca, e quem não traz itens fica sem', async () => {
    const item = (itens?: string[]): AvisoLevantado => ({
      tipo: 'catalogo_criado_carga',
      chave: 'categoria:k1',
      valor: 'Categoria SUBCLAVIA',
      ocorrencias: 3,
      ...(itens && { itens }),
    });
    await registro.registrar(db, {
      origem: 'carga',
      levantados: [item(['A', 'B'])],
      conferidos: [],
      agora,
    });
    expect((await avisos()).map((a) => a.itens)).toEqual([['A', 'B']]);

    await registro.registrar(db, {
      origem: 'carga',
      levantados: [item(['C'])],
      conferidos: [],
      agora,
    });
    expect((await avisos()).map((a) => a.itens)).toEqual([['C']]);

    await registro.registrar(db, { origem: 'carga', levantados: [item()], conferidos: [], agora });
    expect((await avisos()).map((a) => a.itens)).toEqual([[]]);
  });

  it('o tipo precisa existir em tipos_aviso', async () => {
    await expect(
      db
        .insert(schema.avisosCadastro)
        .values({ tipo: 'inexistente' as 'cliente', chave: 'x', valor: 'X' }),
    ).rejects.toThrow();
  });

  it('registrar: a chave levantada e também conferida fica pendente; só a conferida se resolve', async () => {
    await db.insert(schema.avisosCadastro).values([
      { tipo: 'preco_repetido', chave: 'continua', valor: 'C', origem: 'job' },
      { tipo: 'preco_repetido', chave: 'sumiu', valor: 'S', origem: 'job' },
    ]);

    await registro.registrar(db, {
      origem: 'job',
      levantados: [preco('continua', 'C2', randomUUID())],
      conferidos: [
        { tipo: 'preco_repetido', chave: 'continua' },
        { tipo: 'preco_repetido', chave: 'sumiu' },
      ],
      agora,
    });

    expect((await avisos()).map((x) => [x.chave, x.status, x.decididoEm])).toEqual([
      ['continua', 'pendente', null],
      ['sumiu', 'resolvido', agora],
    ]);
  });

  it('sincronizar resolve os pendentes do tipo e origem que não vieram; o ignorado fica', async () => {
    await db.insert(schema.avisosCadastro).values([
      { tipo: 'preco_repetido', chave: 'sumiu', valor: 'S', origem: 'carga' },
      { tipo: 'preco_repetido', chave: 'ficou', valor: 'F', origem: 'carga' },
      {
        tipo: 'preco_repetido',
        chave: 'ign',
        valor: 'I',
        origem: 'carga',
        status: 'ignorado',
        motivo: 'ok',
      },
      { tipo: 'preco_repetido', chave: 'tela', valor: 'T', origem: 'tela' },
      { tipo: 'cliente', chave: 'outro', valor: 'O', origem: 'carga' },
    ]);

    await registro.sincronizar(db, {
      tipo: 'preco_repetido',
      origem: 'carga',
      levantados: [preco('ficou', 'F2', randomUUID()), preco('novo', 'N', randomUUID())],
      agora,
    });

    expect(Object.fromEntries((await avisos()).map((a) => [a.chave, a.status]))).toEqual({
      sumiu: 'resolvido',
      ficou: 'pendente',
      ign: 'ignorado',
      tela: 'pendente',
      outro: 'pendente',
      novo: 'pendente',
    });
  });

  it('resolverDasEntidades resolve só os pendentes dos tipos ligados àqueles itens', async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    await registro.registrar(db, {
      origem: 'carga',
      levantados: [preco('pa', 'A', a), preco('pb', 'B', b)],
      conferidos: [],
      agora,
    });

    await registro.resolverDasEntidades(db, {
      tipos: ['preco_repetido'],
      entidades: [{ tipo: 'preco_cliente', id: a }],
      agora,
    });
    await registro.resolverDasEntidades(db, {
      tipos: ['cliente'],
      entidades: [{ tipo: 'preco_cliente', id: b }],
      agora,
    });

    expect((await avisos()).map((x) => [x.chave, x.status, x.decididoEm])).toEqual([
      ['pa', 'resolvido', agora],
      ['pb', 'pendente', null],
    ]);
  });

  it('grava na transação de quem chama: se ela desfaz, o aviso não fica', async () => {
    await expect(
      db.transaction(async (tx) => {
        await registro.registrar(tx, {
          origem: 'tela',
          levantados: [preco('tx', 'T', randomUUID())],
          conferidos: [],
          agora,
        });
        throw new Error('desfaz');
      }),
    ).rejects.toThrow('desfaz');
    expect(await avisos()).toEqual([]);
  });
});
