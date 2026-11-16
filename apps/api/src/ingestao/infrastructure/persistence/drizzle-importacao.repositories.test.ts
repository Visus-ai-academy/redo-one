import { resolve } from 'node:path';

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleAvisosCadastroRepository } from './drizzle-avisos-cadastro.repository';
import { DrizzleImportacoesRepository } from './drizzle-importacoes.repository';
import { DrizzleParametrosIngestaoRepository } from './drizzle-parametros-ingestao.repository';

const url = process.env.TEST_DATABASE_URL;
const agora = new Date('2026-10-07T12:00:00Z');

describe.skipIf(!url)('repositórios Drizzle da importação', () => {
  let pool: Pool;
  let db: Database;
  let importacaoId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table avisos_cadastro, importacoes, arquivos, parametros_ingestao cascade`,
    );
    const [arquivo] = await db
      .insert(schema.arquivos)
      .values({
        chave: 'ingestao/a.xlsx',
        nomeOriginal: 'a.xlsx',
        tipoConteudo: 'x',
        contexto: 'ingestao',
      })
      .returning();
    const [importacao] = await db
      .insert(schema.importacoes)
      .values({ arquivoId: arquivo?.id ?? '', origem: 'upload_manual' })
      .returning();
    importacaoId = importacao?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('DrizzleImportacoesRepository', () => {
    it('inicia a importação na fila com a chave do arquivo, e de novo numa retentativa', async () => {
      const repo = new DrizzleImportacoesRepository(db);

      expect(await repo.iniciar(importacaoId, agora)).toEqual({
        id: importacaoId,
        arquivoChave: 'ingestao/a.xlsx',
      });
      expect(await repo.iniciar(importacaoId, agora)).not.toBeNull();
      const [linha] = await db.select().from(schema.importacoes);
      expect(linha).toMatchObject({ status: 'processando', iniciadaEm: agora });
    });

    it('finaliza com o resultado e não inicia de novo', async () => {
      const repo = new DrizzleImportacoesRepository(db);
      await repo.iniciar(importacaoId, agora);

      await repo.finalizar(
        importacaoId,
        'concluida',
        {
          formato: 'laudos',
          janelaInicio: '2026-10-01',
          janelaFim: '2026-10-06',
          inseridos: 3,
          errosLinhas: [],
        },
        agora,
      );

      const [linha] = await db.select().from(schema.importacoes);
      expect(linha).toMatchObject({
        status: 'concluida',
        concluidaEm: agora,
        formato: 'laudos',
        janelaInicio: '2026-10-01',
        inseridos: 3,
      });
      expect(await repo.iniciar(importacaoId, agora)).toBeNull();
    });
  });

  describe('DrizzleAvisosCadastroRepository', () => {
    const avisos = () =>
      db.select().from(schema.avisosCadastro).orderBy(schema.avisosCadastro.chave);

    it('cria o aviso e, na próxima importação, atualiza ocorrências e valor', async () => {
      const repo = new DrizzleAvisosCadastroRepository(db);
      const p = {
        tipo: 'cliente' as const,
        chave: 'clinica nova',
        valor: 'Clinica Nova',
        ocorrencias: 2,
      };

      await repo.registrar(importacaoId, [p], [], agora);
      await repo.registrar(
        importacaoId,
        [{ ...p, valor: 'CLINICA NOVA', ocorrencias: 5 }],
        [],
        agora,
      );

      expect(await avisos()).toEqual([
        expect.objectContaining({
          tipo: 'cliente',
          chave: 'clinica nova',
          valor: 'CLINICA NOVA',
          status: 'pendente',
          ocorrencias: 5,
          ultimaImportacaoId: importacaoId,
        }),
      ]);
    });

    it('o ignorado continua ignorado; o resolvido que volta a faltar reabre', async () => {
      const repo = new DrizzleAvisosCadastroRepository(db);
      await db.insert(schema.avisosCadastro).values([
        { tipo: 'cliente', chave: 'a', valor: 'A', status: 'ignorado' },
        { tipo: 'cliente', chave: 'b', valor: 'B', status: 'resolvido' },
      ]);

      await repo.registrar(
        importacaoId,
        ['a', 'b'].map((chave) => ({
          tipo: 'cliente' as const,
          chave,
          valor: chave,
          ocorrencias: 1,
        })),
        [],
        agora,
      );

      expect((await avisos()).map((a) => a.status)).toEqual(['ignorado', 'pendente']);
    });

    it('marca como resolvido o pendente que a importação conferiu no cadastro', async () => {
      const repo = new DrizzleAvisosCadastroRepository(db);
      await db.insert(schema.avisosCadastro).values([
        { tipo: 'medico', chave: 'ana', valor: 'Ana' },
        { tipo: 'cliente', chave: 'ana', valor: 'Ana' },
      ]);

      await repo.registrar(importacaoId, [], [{ tipo: 'medico', chave: 'ana' }], agora);

      const lista = await db
        .select()
        .from(schema.avisosCadastro)
        .where(eq(schema.avisosCadastro.chave, 'ana'));
      expect(Object.fromEntries(lista.map((a) => [a.tipo, a.status]))).toEqual({
        medico: 'resolvido',
        cliente: 'pendente',
      });
    });
  });

  describe('DrizzleParametrosIngestaoRepository', () => {
    it('sem linha gravada, devolve os valores padrão', async () => {
      expect(await new DrizzleParametrosIngestaoRepository(db).obter()).toEqual({
        travaRemocaoMinimo: 500,
        travaRemocaoFator: 2,
        retencaoLinhasBrutasDias: 90,
      });
    });

    it('devolve o que foi gravado', async () => {
      await db.insert(schema.parametrosIngestao).values({ travaRemocaoMinimo: 10 });
      expect((await new DrizzleParametrosIngestaoRepository(db).obter()).travaRemocaoMinimo).toBe(
        10,
      );
    });
  });
});
