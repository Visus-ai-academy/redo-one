import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { classificarEstudo } from '../../domain/classificar-estudo';
import { DrizzleCadastrosIngestao } from './drizzle-cadastros-ingestao';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleCadastrosIngestao', () => {
  let pool: Pool;
  let db: Database;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    await db.execute(
      sql`truncate table modalidades, especialidades, categorias_exame, prioridades, exames,
        quebras_estudo, exames_de_para_valores, clientes, sufixos_nome_cliente, medicos cascade`,
    );

    const id = async <T extends { id: string }>(p: Promise<T[]>) => (await p)[0]?.id ?? '';
    ids.ct = await id(db.insert(schema.modalidades).values({ codigo: 'CT' }).returning());
    ids.rx = await id(db.insert(schema.modalidades).values({ codigo: 'RX' }).returning());
    await db.insert(schema.modalidadesDePara).values({ origem: 'DX', modalidadeId: ids.rx });
    ids.mi = await id(
      db.insert(schema.especialidades).values({ nome: 'MEDICINA INTERNA' }).returning(),
    );
    ids.msk = await id(
      db.insert(schema.especialidades).values({ nome: 'MÚSCULO ESQUELÉTICO' }).returning(),
    );
    await db.insert(schema.especialidadesDePara).values([
      { tipo: 'regiao_anatomica', origem: 'JOELHO', especialidadeId: ids.msk },
      { tipo: 'invalida', origem: 'ONCOLÓGICO' },
    ]);
    ids.sc = await id(db.insert(schema.categoriasExame).values({ nome: 'SC' }).returning());
    ids.rotina = await id(db.insert(schema.prioridades).values({ nome: 'ROTINA' }).returning());
    await db
      .insert(schema.prioridadesDePara)
      .values({ origem: 'Eletivo', prioridadeId: ids.rotina });
    ids.torax = await id(
      db
        .insert(schema.exames)
        .values({
          nome: 'TC TORAX',
          chaveNormalizada: 'tc torax',
          modalidadeId: ids.ct,
          especialidadeId: ids.mi,
          categoriaId: ids.sc,
        })
        .returning(),
    );
    await db
      .insert(schema.exames)
      .values({ nome: 'TC INATIVO', chaveNormalizada: 'tc inativo', ativo: false });
    await db.insert(schema.examesDeParaValores).values([
      {
        estudoDescricao: 'TC TORAX ESPECIAL X2',
        chaveNormalizada: 'tc torax especial x2',
        valores: 3,
        exameId: ids.torax,
      },
      { estudoDescricao: 'TC ZERADO', chaveNormalizada: 'tc zerado', valores: 0 },
    ]);
    const quebra = await id(
      db
        .insert(schema.quebrasEstudo)
        .values({ estudoOrigem: 'TC TORAX E ABDOME X2', chaveNormalizada: 'tc torax e abdome x2' })
        .returning(),
    );
    await db.insert(schema.quebrasEstudoPecas).values({ quebraId: quebra, exameId: ids.torax });

    ids.prn = await id(
      db.insert(schema.clientes).values({ nome: 'PRN', chaveNormalizada: 'prn' }).returning(),
    );
    ids.unidade = await id(
      db
        .insert(schema.clientes)
        .values({ nome: 'PRN TELE A', chaveNormalizada: 'prn tele a', unificadoEmId: ids.prn })
        .returning(),
    );
    await db
      .insert(schema.clientesAliases)
      .values({ clienteId: ids.unidade, tipo: 'exato', padrao: 'PRN-A', chave: 'PRN-A' });
    await db.insert(schema.sufixosNomeCliente).values({ sufixo: '-CT' });
    ids.ana = await id(
      db
        .insert(schema.medicos)
        .values({ nome: 'Ana Souza', chaveNormalizada: 'ana souza', idMobilemed: 45 })
        .returning(),
    );
    await db
      .insert(schema.medicosAliases)
      .values({ medicoId: ids.ana, nomeOrigem: 'A. Souza', chaveNormalizada: 'a souza' });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('monta o retrato do catálogo com as chaves que a importação compara', async () => {
    const { catalogo, prioridades } = await new DrizzleCadastrosIngestao(db).carregar();
    const classificar = (estudo: string, modalidade = 'CT', especialidade = '') =>
      classificarEstudo({ estudo, modalidade, especialidade, valores: 0 }, catalogo);

    expect(classificar('TC TORAX X1')).toMatchObject({ exameId: ids.torax, categoriaId: ids.sc });
    expect(classificar('TC INATIVO').exameId).toBeNull();
    // O valor fora do padrão casa sem o sufixo X dos dois lados.
    expect(classificar('TC TORAX ESPECIAL')).toMatchObject({ volume: 3, especialidadeId: ids.mi });
    expect(classificar('TC ZERADO').volume).toBe(1);
    expect(classificar('TC TORAX X1 E ABDOME X2').pecas).toEqual([
      { exameId: ids.torax, categoriaId: ids.sc },
    ]);
    expect(classificar('RX', 'dx').modalidadeId).toBe(ids.rx);
    expect(classificar('RM', 'CT', 'joelho').especialidadeId).toBe(ids.msk);
    expect(classificar('RM', 'CT', 'Musculo esqueletico').especialidadeId).toBe(ids.msk);
    expect(classificar('RM', 'CT', 'Oncologico').pendencias).not.toContainEqual(
      expect.objectContaining({ tipo: 'especialidade' }),
    );
    expect(prioridades.get('eletivo')).toBe(ids.rotina);
    expect(prioridades.get('rotina')).toBe(ids.rotina);
  });

  it('resolve cliente (com unidade → principal) e médico', async () => {
    const cadastros = await new DrizzleCadastrosIngestao(db).carregar();

    expect(cadastros.resolverCliente('PRN-A')).toBe(ids.prn);
    expect(cadastros.resolverCliente('PRN-CT')).toBe(ids.prn);
    expect(cadastros.resolverMedico('Dra. A. Souza', null)).toBe(ids.ana);
    // Pelo id da conta MobileMed, mesmo com um nome que o cadastro não conhece.
    expect(cadastros.resolverMedico('Dra. Ana Souza Prado', 45)).toBe(ids.ana);
    expect(cadastros.resolverMedico('Dra. Ana Souza Prado', 999)).toBeNull();
  });
});
