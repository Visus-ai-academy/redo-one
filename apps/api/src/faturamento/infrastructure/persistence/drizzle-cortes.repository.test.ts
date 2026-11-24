import { resolve } from 'node:path';

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { CORTE_PADRAO_INICIAL } from '../../../ingestao/domain/competencia';
import { DrizzleCortesRepository } from './drizzle-cortes.repository';

const url = process.env.TEST_DATABASE_URL;

type NovaLinha = typeof schema.cortesCompetencia.$inferInsert;

describe.skipIf(!url)('DrizzleCortesRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleCortesRepository;
  let clienteId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    repo = new DrizzleCortesRepository(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table cortes_competencia`);
    const nome = `CLIENTE_CORTE_${Math.random()}`;
    const [cliente] = await db
      .insert(schema.clientes)
      .values({ nome, chaveNormalizada: nome })
      .returning();
    clienteId = cliente?.id ?? '';
  });

  afterAll(async () => {
    await db.execute(sql`truncate table cortes_competencia`);
    await db.delete(schema.clientes).where(sql`${schema.clientes.nome} like 'CLIENTE_CORTE_%'`);
    await pool.end();
  });

  const inserir = (linha: NovaLinha) => db.insert(schema.cortesCompetencia).values(linha);

  describe('carregar', () => {
    it('sem vigência padrão gravada, o padrão é o corte inicial', async () => {
      const tabela = await repo.carregar();

      expect(tabela.padrao).toEqual([CORTE_PADRAO_INICIAL]);
      expect(tabela.porCliente.size).toBe(0);
    });

    it('monta o padrão e as vigências do cliente, em ordem de desde', async () => {
      await inserir({ desde: '2027-01', ultimoDia: true, mes: 'proprio', consideraExame: false });
      await inserir({ desde: '2000-01', dia: 7, mes: 'seguinte', consideraExame: true });
      await inserir({ clienteId, desde: '2027-03', usaPadrao: true });
      await inserir({
        clienteId,
        desde: '2026-12',
        dia: 25,
        mes: 'proprio',
        consideraExame: false,
      });

      const tabela = await repo.carregar();

      expect(tabela.padrao).toEqual([
        { desde: '2000-01', corte: { dia: 7, mes: 'seguinte', consideraExame: true } },
        { desde: '2027-01', corte: { dia: 'ultimo', mes: 'proprio', consideraExame: false } },
      ]);
      expect(tabela.porCliente.get(clienteId)).toEqual([
        { desde: '2026-12', corte: { dia: 25, mes: 'proprio', consideraExame: false } },
        { desde: '2027-03', corte: null },
      ]);
    });

    it('cliente só com "usa o padrão" e sem padrão gravado: padrão inicial e corte nulo', async () => {
      await inserir({ clienteId, desde: '2026-12', usaPadrao: true });

      const tabela = await repo.carregar();

      expect(tabela.padrao).toEqual([CORTE_PADRAO_INICIAL]);
      expect(tabela.porCliente.get(clienteId)).toEqual([{ desde: '2026-12', corte: null }]);
    });
  });

  describe('garantirPadraoInicial', () => {
    it('grava a vigência padrão inicial uma vez só', async () => {
      await repo.garantirPadraoInicial();
      await repo.garantirPadraoInicial();

      const linhas = await db.select().from(schema.cortesCompetencia);
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatchObject({
        clienteId: null,
        desde: '2000-01',
        usaPadrao: false,
        dia: 7,
        ultimoDia: false,
        mes: 'seguinte',
        consideraExame: true,
      });
    });

    it('não grava se já há vigência padrão, mesmo que outra', async () => {
      await inserir({ desde: '2026-12', ultimoDia: true, mes: 'proprio', consideraExame: true });
      await inserir({ clienteId, desde: '2026-12', usaPadrao: true });

      await repo.garantirPadraoInicial();

      const padrao = await db
        .select()
        .from(schema.cortesCompetencia)
        .where(sql`${schema.cortesCompetencia.clienteId} is null`);
      expect(padrao.map((l) => l.desde)).toEqual(['2026-12']);
    });

    it('grava a inicial mesmo com vigências de cliente', async () => {
      await inserir({ clienteId, desde: '2026-12', usaPadrao: true });

      await repo.garantirPadraoInicial();

      const padrao = await db
        .select()
        .from(schema.cortesCompetencia)
        .where(eq(schema.cortesCompetencia.desde, '2000-01'));
      expect(padrao).toHaveLength(1);
    });
  });

  describe('restrições da tabela', () => {
    it.each<[string, () => NovaLinha]>([
      [
        'padrão repetido no mesmo desde',
        () => ({ desde: '2000-01', dia: 8, mes: 'seguinte', consideraExame: true }),
      ],
      ['"usa o padrão" sem cliente', () => ({ desde: '2026-12', usaPadrao: true })],
      ['"usa o padrão" com dia', () => ({ clienteId, desde: '2026-12', usaPadrao: true, dia: 7 })],
      [
        '"usa o padrão" com último dia',
        () => ({ clienteId, desde: '2026-12', usaPadrao: true, ultimoDia: true }),
      ],
      [
        '"usa o padrão" com mês',
        () => ({ clienteId, desde: '2026-12', usaPadrao: true, mes: 'proprio' }),
      ],
      [
        '"usa o padrão" com considera exame',
        () => ({ clienteId, desde: '2026-12', usaPadrao: true, consideraExame: true }),
      ],
      [
        'dia e último dia juntos',
        () => ({
          desde: '2026-12',
          dia: 7,
          ultimoDia: true,
          mes: 'seguinte',
          consideraExame: true,
        }),
      ],
      [
        'nem dia nem último dia',
        () => ({ desde: '2026-12', mes: 'seguinte', consideraExame: true }),
      ],
      ['corte sem mês', () => ({ desde: '2026-12', dia: 7, consideraExame: true })],
      ['corte sem considera exame', () => ({ desde: '2026-12', dia: 7, mes: 'seguinte' })],
      ['dia 0', () => ({ desde: '2026-12', dia: 0, mes: 'seguinte', consideraExame: true })],
      ['dia 32', () => ({ desde: '2026-12', dia: 32, mes: 'seguinte', consideraExame: true })],
    ])('recusa %s', async (_caso, linha) => {
      await inserir({ desde: '2000-01', dia: 7, mes: 'seguinte', consideraExame: true });

      await expect(inserir(linha())).rejects.toThrow();
    });

    it('recusa mês fora de próprio e seguinte', async () => {
      await expect(
        db.execute(
          sql`insert into cortes_competencia (desde, dia, mes, considera_exame) values ('2026-12', 7, 'anterior', true)`,
        ),
      ).rejects.toThrow();
    });

    it('recusa duas vigências do mesmo cliente no mesmo desde, mas aceita a do padrão e a de outro cliente', async () => {
      await inserir({ clienteId, desde: '2026-12', usaPadrao: true });
      const nome = `CLIENTE_CORTE_${Math.random()}`;
      const [outro] = await db
        .insert(schema.clientes)
        .values({ nome, chaveNormalizada: nome })
        .returning();

      await expect(
        inserir({ clienteId, desde: '2026-12', dia: 25, mes: 'proprio', consideraExame: false }),
      ).rejects.toThrow();
      await inserir({ clienteId: outro?.id, desde: '2026-12', usaPadrao: true });
      await inserir({ desde: '2026-12', dia: 7, mes: 'seguinte', consideraExame: true });
    });

    it('aceita dia 1 e dia 31', async () => {
      await inserir({ desde: '2026-12', dia: 1, mes: 'proprio', consideraExame: true });
      await inserir({ desde: '2027-01', dia: 31, mes: 'proprio', consideraExame: true });
    });
  });
});
