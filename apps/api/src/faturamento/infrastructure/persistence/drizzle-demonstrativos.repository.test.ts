import { resolve } from 'node:path';

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { Demonstrativo } from '../../domain/demonstrativo';
import { DrizzleDemonstrativosRepository } from './drizzle-demonstrativos.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleDemonstrativosRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleDemonstrativosRepository;
  let ids: { cliente: string; mod: string; esp: string; cat: string; pri: string };

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    repo = new DrizzleDemonstrativosRepository(db);
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table demonstrativos_faturamento, demonstrativos_faturamento_itens, competencias cascade`,
    );
    const s = Math.random().toString(36).slice(2, 8);
    const [c] = await db
      .insert(schema.clientes)
      .values({ nome: `DEM_${s}`, chaveNormalizada: `dem_${s}` })
      .returning();
    const [m] = await db
      .insert(schema.modalidades)
      .values({ codigo: `M${s}` })
      .returning();
    const [e] = await db
      .insert(schema.especialidades)
      .values({ nome: `E${s}` })
      .returning();
    const [ca] = await db
      .insert(schema.categoriasExame)
      .values({ nome: `C${s}` })
      .returning();
    const [p] = await db
      .insert(schema.prioridades)
      .values({ nome: `P${s}` })
      .returning();
    ids = {
      cliente: c?.id ?? '',
      mod: m?.id ?? '',
      esp: e?.id ?? '',
      cat: ca?.id ?? '',
      pri: p?.id ?? '',
    };
    await db.insert(schema.competencias).values({ competencia: '2026-11', status: 'aberta' });
  });

  afterAll(async () => {
    await pool.end();
  });

  const demonstrativo = (valorCentavos: number): Demonstrativo => ({
    clienteId: ids.cliente,
    contratadoId: null,
    laudos: 2,
    quantidade: 3,
    valorCentavos,
    quantidadeSemPreco: 0,
    nadaAFaturar: false,
    itens: [
      {
        membroId: ids.cliente,
        modalidadeId: ids.mod,
        especialidadeId: ids.esp,
        categoriaId: ids.cat,
        prioridadeId: ids.pri,
        dia: '2026-11-03',
        unitarioCentavos: valorCentavos / 3,
        linhaPrecoId: null,
        origem: 'principal',
        como: 'exato',
        quantidade: 3,
        valorCentavos,
        laudos: 2,
      },
    ],
  });

  const gravar = (origem: 'previa' | 'fechamento' | 'recalculo', valor: number) =>
    repo.gravar({
      competencia: '2026-11',
      origem,
      recalculoId: null,
      geradoEm: new Date('2026-11-26T12:00:00Z'),
      demonstrativos: [demonstrativo(valor)],
    });

  it('a prévia da aberta é substituída a cada geração; lê com os itens e os nomes', async () => {
    expect(await gravar('previa', 300)).toBe(true);
    expect(await gravar('previa', 600)).toBe(true);

    const versoes = await repo.versoes('2026-11', ids.cliente);
    expect(versoes.map((v) => [v.versao, v.origem, v.vigente, v.valorCentavos])).toEqual([
      [1, 'previa', true, 600],
    ]);
    const d = await repo.obter('2026-11', ids.cliente);
    expect(d?.itens).toHaveLength(1);
    expect(d?.itens[0]?.quantidade).toBe(3);
    expect(d?.itens[0]?.nomes.modalidade).toMatch(/^M/);
    expect(await repo.totais('2026-11')).toEqual({
      clientes: 1,
      laudos: 2,
      quantidade: 3,
      valorCentavos: 600,
      quantidadeSemPreco: 0,
    });
    const pagina = await repo.listar('2026-11', { pagina: 1, porPagina: 10 });
    expect(pagina.total).toBe(1);
  });

  it('prévia não grava na fechada; fechamento e recálculo viram versões, a anterior guardada', async () => {
    await gravar('previa', 300);
    await db
      .update(schema.competencias)
      .set({ status: 'fechada' })
      .where(eq(schema.competencias.competencia, '2026-11'));

    expect(await gravar('previa', 999)).toBe(false);
    expect(await gravar('fechamento', 300)).toBe(true);
    expect(await gravar('recalculo', 450)).toBe(true);

    const versoes = await repo.versoes('2026-11', ids.cliente);
    expect(versoes.map((v) => [v.versao, v.origem, v.vigente, v.valorCentavos])).toEqual([
      [2, 'recalculo', true, 450],
      // A prévia sai no fechamento: a versão 1 é a do fechamento.
      [1, 'fechamento', false, 300],
    ]);
    expect((await repo.obter('2026-11', ids.cliente, 1))?.itens).toHaveLength(1);
  });

  it('versão de fechamento não grava na aberta', async () => {
    expect(await gravar('fechamento', 300)).toBe(false);
    expect(await repo.versoes('2026-11', ids.cliente)).toEqual([]);
  });
});
