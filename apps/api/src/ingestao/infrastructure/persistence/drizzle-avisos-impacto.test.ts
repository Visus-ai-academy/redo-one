import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleConsultaAvisos } from './drizzle-consulta-avisos';
import { DrizzleTiposAvisoRepository } from './drizzle-tipos-aviso.repository';

const url = process.env.TEST_DATABASE_URL;

/** Consulta dos avisos (faixa, selo, filtros de competência e item) e configuração por tipo. */
describe.skipIf(!url)('avisos com impacto (Drizzle)', () => {
  let pool: Pool;
  let db: Database;
  let configuracaoOriginal: (typeof schema.tiposAviso.$inferSelect)[];

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    configuracaoOriginal = await db.select().from(schema.tiposAviso);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table avisos_cadastro cascade`);
  });

  afterEach(async () => {
    // A configuração vem da migration e é de todos os testes: volta ao que era.
    await db.delete(schema.tiposAvisoResponsaveis);
    for (const c of configuracaoOriginal) {
      await db
        .update(schema.tiposAviso)
        .set({ impedeFecharCompetencia: c.impedeFecharCompetencia })
        .where(eq(schema.tiposAviso.tipo, c.tipo));
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  const inserir = (valores: Partial<typeof schema.avisosCadastro.$inferInsert>[]) =>
    db
      .insert(schema.avisosCadastro)
      .values(
        valores.map((v, i) => ({ tipo: 'cliente' as const, chave: `k${i}`, valor: `V${i}`, ...v })),
      )
      .returning();

  const criarPapel = async (nome: string) => {
    const [p] = await db
      .insert(schema.papeis)
      .values({ nome: `${nome} ${randomUUID()}` })
      .returning();
    return p as typeof schema.papeis.$inferSelect;
  };

  describe('DrizzleConsultaAvisos', () => {
    const consulta = () => new DrizzleConsultaAvisos(db);
    const pagina = { pagina: 1, porPagina: 10 };

    it('filtra pela competência ligada (até nulo = em diante) e devolve competências e itens', async () => {
      const c1 = randomUUID();
      const [a] = await inserir([
        { valor: 'Out', competenciaDesde: '2026-10', competenciaAte: '2026-10' },
        { valor: 'Desde set', competenciaDesde: '2026-09', competenciaAte: null },
        { valor: 'Sem competência' },
      ]);
      await db
        .insert(schema.avisosEntidades)
        .values({ avisoId: a?.id ?? '', entidade: 'cliente', entidadeId: c1 });

      const outubro = await consulta().listar({
        ...pagina,
        tipos: ['cliente'],
        competencia: '2026-10',
      });
      expect(outubro.itens.map((x) => x.valor).sort()).toEqual(['Desde set', 'Out']);
      const novembro = await consulta().listar({
        ...pagina,
        tipos: ['cliente'],
        competencia: '2026-11',
      });
      expect(novembro.itens.map((x) => x.valor)).toEqual(['Desde set']);

      const doItem = await consulta().listar({
        ...pagina,
        tipos: ['cliente'],
        entidade: { tipo: 'cliente', id: c1 },
      });
      expect(doItem.itens).toEqual([
        expect.objectContaining({
          valor: 'Out',
          origem: 'importacao',
          competencias: { desde: '2026-10', ate: '2026-10' },
          entidades: [{ tipo: 'cliente', id: c1 }],
        }),
      ]);
      expect(await consulta().obter(a?.id ?? '')).toMatchObject({
        entidades: [{ tipo: 'cliente', id: c1 }],
      });
    });

    it('resume os pendentes dos tipos: quantos e o mais antigo', async () => {
      await inserir([
        { primeiraVezEm: new Date('2026-11-20T10:00:00Z') },
        { primeiraVezEm: new Date('2026-11-10T10:00:00Z'), status: 'resolvido' },
        { primeiraVezEm: new Date('2026-11-15T10:00:00Z'), tipo: 'medico' },
        { primeiraVezEm: new Date('2026-11-18T10:00:00Z') },
      ]);

      expect(await consulta().resumoPendentes(['cliente'])).toEqual({
        total: 2,
        maisAntigoEm: new Date('2026-11-18T10:00:00Z'),
      });
      expect(await consulta().resumoPendentes([])).toEqual({ total: 0, maisAntigoEm: null });
    });

    it('os pendentes dos itens da página, numa consulta, só dos tipos pedidos', async () => {
      const [c1, c2, c3] = [randomUUID(), randomUUID(), randomUUID()];
      const [a, b, r] = await inserir([
        { valor: 'A' },
        { valor: 'B', tipo: 'cliente_ambiguo' },
        { valor: 'R', status: 'resolvido' },
      ]);
      await db.insert(schema.avisosEntidades).values([
        { avisoId: a?.id ?? '', entidade: 'cliente', entidadeId: c1 },
        { avisoId: b?.id ?? '', entidade: 'cliente', entidadeId: c1 },
        { avisoId: b?.id ?? '', entidade: 'cliente', entidadeId: c2 },
        { avisoId: r?.id ?? '', entidade: 'cliente', entidadeId: c3 },
        { avisoId: a?.id ?? '', entidade: 'medico', entidadeId: c2 },
      ]);

      const achados = await consulta().pendentesDasEntidades(
        'cliente',
        [c1, c2, c3],
        ['cliente', 'cliente_ambiguo'],
      );
      expect(achados.map((x) => [x.entidadeId, x.valor]).sort()).toEqual(
        [
          [c1, 'A'],
          [c1, 'B'],
          [c2, 'B'],
        ].sort(),
      );
      expect(await consulta().pendentesDasEntidades('cliente', [c1], ['medico'])).toEqual([]);
    });
  });

  describe('DrizzleTiposAvisoRepository', () => {
    const repo = () => new DrizzleTiposAvisoRepository(db);

    it('a migration traz todos os tipos, sem responsáveis, com a trava nos que afetam o faturamento', async () => {
      const tipos = await repo().listar();
      expect(tipos.map((t) => t.tipo)).toEqual([
        'cliente',
        'medico',
        'estudo',
        'modalidade',
        'especialidade',
        'prioridade',
        'prioridade_operacao',
        'conta_unidade',
        'cliente_ambiguo',
        'preco_repetido',
        'catalogo_criado_carga',
      ]);
      expect(tipos.filter((t) => t.impedeFecharCompetencia).map((t) => t.tipo)).toEqual([
        'cliente',
        'estudo',
        'preco_repetido',
      ]);
      expect(tipos.every((t) => t.responsaveis.length === 0)).toBe(true);
    });

    it('salva responsáveis e trava; acha os tipos dos papéis; conta os pendentes', async () => {
      const [fat, op] = [await criarPapel('Financeiro'), await criarPapel('Operação')];
      await inserir([{}, { status: 'ignorado', motivo: 'x' }]);

      await repo().salvar('cliente', {
        impedeFecharCompetencia: false,
        papeisIds: [fat.id, op.id],
        em: new Date(),
      });
      await repo().salvar('medico', {
        impedeFecharCompetencia: true,
        papeisIds: [op.id],
        em: new Date(),
      });
      await repo().salvar('medico', {
        impedeFecharCompetencia: true,
        papeisIds: [fat.id],
        em: new Date(),
      });

      expect(await repo().obter('cliente')).toMatchObject({
        impedeFecharCompetencia: false,
        pendentes: 1,
        responsaveis: [
          { id: fat.id, nome: fat.nome },
          { id: op.id, nome: op.nome },
        ],
      });
      expect((await repo().tiposDosPapeis([fat.id])).sort()).toEqual(['cliente', 'medico']);
      expect(await repo().tiposDosPapeis([op.id])).toEqual(['cliente']);
      expect(await repo().papeisInexistentes([fat.id, randomUUID()])).toHaveLength(1);
    });
  });
});
