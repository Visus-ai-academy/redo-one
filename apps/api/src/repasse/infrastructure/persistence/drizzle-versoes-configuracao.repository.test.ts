import { resolve } from 'node:path';

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { VersaoAlteradaRepasseError } from '../../domain/versoes';
import { DrizzleConfiguracaoRepasseRepository } from './drizzle-configuracao-repasse.repository';
import { DrizzleVersoesConfiguracaoRepository } from './drizzle-versoes-configuracao.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleVersoesConfiguracaoRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleVersoesConfiguracaoRepository;
  let config: DrizzleConfiguracaoRepasseRepository;
  let usuario: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 2 });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    repo = new DrizzleVersoesConfiguracaoRepository(db);
    config = new DrizzleConfiguracaoRepasseRepository(db);
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table reclassificacoes_repasse, parametros_repasse, especialidades, equipes, usuarios cascade`,
    );
    const [u] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Bruno', email: 'bruno@x.com' } as never)
      .returning();
    usuario = (u as { id: string }).id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it('altera a reclassificação (encerra e cria com os recortes) e recusa o encerrar desatualizado', async () => {
    const [neuro] = await db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning();
    const [eq1] = await db.insert(schema.equipes).values({ nome: 'Neurologistas' }).returning();
    const base = {
      ordem: 1,
      descricao: 'Coluna',
      modalidadeIds: null,
      especialidadeIds: null,
      categoriaIds: null,
      equipeIds: [(eq1 as { id: string }).id],
      especialidadeDestinoId: (neuro as { id: string }).id,
      categoriaDestinoId: null,
    };
    const antiga = await config.criarReclassificacao(
      { ...base, vigenciaDesde: '2026-11' },
      usuario,
      new Date(),
    );
    const nova = await repo.gravarReclassificacao(
      [{ tipo: 'encerrar', id: antiga, vigenciaAteAntes: null, vigenciaAte: '2026-11' }],
      { ...base, ordem: 2, vigenciaDesde: '2026-12', vigenciaAte: null },
      usuario,
      new Date(),
    );
    const lista = await config.listarReclassificacoes();
    expect(lista.map((r) => [r.id, r.ordem, r.vigenciaAte, r.equipeIds])).toEqual([
      [antiga, 1, '2026-11', base.equipeIds],
      [nova, 2, null, base.equipeIds],
    ]);
    expect((await repo.nomes()).get((eq1 as { id: string }).id)).toBe('Neurologistas');
    await expect(
      repo.gravarReclassificacao(
        [{ tipo: 'encerrar', id: antiga, vigenciaAteAntes: null, vigenciaAte: '2026-10' }],
        null,
        usuario,
        new Date(),
      ),
    ).rejects.toThrow(VersaoAlteradaRepasseError);
  });

  it('exclui só os parâmetros programados', async () => {
    const dados = {
      tarifaPeerReviewCentavos: 1,
      tarifaPlantaoCentavos: 1,
      contratadoRegistroId: null,
      pagaDuplicados: true,
      diaVencimento: 10,
      diaCorteAntecipacao: 10,
      categoriaFinanceiraSocio: 'a',
      categoriaFinanceiraNaoSocio: 'b',
      faixasListaAtraso: [{ exames: 10, valorCentavos: 100 }],
    };
    const vigente = await config.criarParametros('2020-01', dados, usuario, new Date());
    const futura = await config.criarParametros('2099-01', dados, usuario, new Date());
    expect(await repo.excluirParametros(vigente)).toBe(false);
    expect(await repo.excluirParametros(futura)).toBe(true);
    const restantes = await db
      .select()
      .from(schema.parametrosRepasse)
      .where(eq(schema.parametrosRepasse.id, futura));
    expect(restantes).toEqual([]);
  });
});
