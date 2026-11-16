import { resolve } from 'node:path';

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';

import { DrizzleArquivosRepository } from './drizzle-arquivos.repository';
import { DrizzleAvisosCadastroRepository } from './drizzle-avisos-cadastro.repository';
import { DrizzleConsultaAvisos } from './drizzle-consulta-avisos';
import { DrizzleConsultaImportacoes } from './drizzle-consulta-importacoes';
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
    await runMigrations({ pgPool: pool });
  });

  const criarUsuario = async () => {
    const [papel] = await db
      .insert(schema.papeis)
      .values({ nome: `Teste ${Math.random()}` })
      .returning();
    const [usuario] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Maria', email: `maria${Math.random()}@teste.com`, papelId: papel?.id ?? '' })
      .returning();
    return usuario?.id ?? '';
  };

  beforeEach(async () => {
    await db.execute(
      sql`truncate table avisos_cadastro, importacoes, arquivos, parametros_ingestao cascade`,
    );
    await db.execute(sql`delete from graphile_worker._private_jobs`);
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

  describe('DrizzleArquivosRepository', () => {
    it('cria e lê o arquivo da ingestão, sem achar o de outro contexto', async () => {
      const repo = new DrizzleArquivosRepository(db);
      const usuarioId = await criarUsuario();

      const id = await repo.criar({
        chave: 'ingestao/b.xlsx',
        nomeOriginal: 'laudos.xlsx',
        tipoConteudo: 'x',
        tamanhoBytes: 10,
        criadoPorId: usuarioId,
      });

      expect(await repo.obter(id)).toEqual({
        id,
        chave: 'ingestao/b.xlsx',
        nomeOriginal: 'laudos.xlsx',
        tamanhoBytes: 10,
        criadoPorId: usuarioId,
        enviadoEm: null,
      });
      const [outro] = await db
        .insert(schema.arquivos)
        .values({
          chave: 'contratos/c.pdf',
          nomeOriginal: 'c.pdf',
          tipoConteudo: 'x',
          contexto: 'contratos',
        })
        .returning();
      expect(await repo.obter(outro?.id ?? '')).toBeNull();
    });
  });

  describe('DrizzleImportacoesRepository', () => {
    it('criarNaFila marca o arquivo, cria a importação e enfileira o job na fila da ingestão', async () => {
      const repo = new DrizzleImportacoesRepository(db);
      const usuarioId = await criarUsuario();
      const [arquivo] = await db
        .insert(schema.arquivos)
        .values({
          chave: 'ingestao/n.xlsx',
          nomeOriginal: 'n.xlsx',
          tipoConteudo: 'x',
          contexto: 'ingestao',
        })
        .returning();

      const id = await repo.criarNaFila({
        arquivoId: arquivo?.id ?? '',
        enviadaPorId: usuarioId,
        agora,
      });

      const [importacao] = await db
        .select()
        .from(schema.importacoes)
        .where(eq(schema.importacoes.id, id));
      expect(importacao).toMatchObject({
        status: 'na_fila',
        origem: 'upload_manual',
        enviadaPorId: usuarioId,
      });
      const [enviado] = await db
        .select()
        .from(schema.arquivos)
        .where(eq(schema.arquivos.id, arquivo?.id ?? ''));
      expect(enviado?.enviadoEm).toEqual(agora);
      const jobs = await db.execute<{ task_identifier: string; queue_name: string }>(
        sql`select task_identifier, queue_name from graphile_worker.jobs where task_identifier = 'ingestao.importar'`,
      );
      expect(jobs.rows).toEqual([{ task_identifier: 'ingestao.importar', queue_name: 'ingestao' }]);
    });

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

  describe('DrizzleConsultaImportacoes', () => {
    it('lista a mais nova primeiro, paginada, com o nome do arquivo e de quem enviou', async () => {
      const usuarioId = await criarUsuario();
      const repo = new DrizzleImportacoesRepository(db);
      const ids: string[] = [];
      for (const n of [1, 2, 3]) {
        const [arquivo] = await db
          .insert(schema.arquivos)
          .values({
            chave: `ingestao/${n}.xlsx`,
            nomeOriginal: `laudos${n}.xlsx`,
            tipoConteudo: 'x',
            contexto: 'ingestao',
          })
          .returning();
        ids.push(
          await repo.criarNaFila({ arquivoId: arquivo?.id ?? '', enviadaPorId: usuarioId, agora }),
        );
      }
      const consulta = new DrizzleConsultaImportacoes(db);

      const pagina = await consulta.listar({ pagina: 1, porPagina: 2 });

      expect(pagina.total).toBe(4);
      expect(pagina.itens.map((i) => i.nomeArquivo)).toEqual(['laudos3.xlsx', 'laudos2.xlsx']);
      expect(pagina.itens[0]).toMatchObject({
        id: ids[2],
        status: 'na_fila',
        origem: 'upload_manual',
        enviadaPor: { id: usuarioId, nome: 'Maria' },
      });
    });

    it('o detalhe traz os erros de linha e a chave do arquivo; id inexistente dá nulo', async () => {
      await new DrizzleImportacoesRepository(db).finalizar(
        importacaoId,
        'concluida',
        { errosLinhas: [{ linha: 3, mensagem: 'STATUS: obrigatório' }] },
        agora,
      );
      const consulta = new DrizzleConsultaImportacoes(db);

      expect(await consulta.obter(importacaoId)).toMatchObject({
        id: importacaoId,
        nomeArquivo: 'a.xlsx',
        arquivoChave: 'ingestao/a.xlsx',
        enviadaPor: null,
        errosLinhas: [{ linha: 3, mensagem: 'STATUS: obrigatório' }],
      });
      expect(await consulta.obter('00000000-0000-0000-0000-000000000000')).toBeNull();
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

  describe('DrizzleConsultaAvisos', () => {
    const inserir = (valores: Partial<typeof schema.avisosCadastro.$inferInsert>[]) =>
      db
        .insert(schema.avisosCadastro)
        .values(
          valores.map((v, i) => ({
            tipo: 'cliente' as const,
            chave: `k${i}`,
            valor: `V${i}`,
            ultimaVezEm: new Date(Date.UTC(2026, 9, 1 + i)),
            ...v,
          })),
        )
        .returning();

    it('lista o visto por último primeiro, com filtro de status e tipo', async () => {
      await inserir([
        { valor: 'A' },
        { valor: 'B', status: 'ignorado' },
        { valor: 'C', tipo: 'medico' },
      ]);
      const consulta = new DrizzleConsultaAvisos(db);

      const todos = await consulta.listar({ pagina: 1, porPagina: 10 });
      expect(todos.total).toBe(3);
      expect(todos.itens.map((a) => a.valor)).toEqual(['C', 'B', 'A']);
      const pendentesDeCliente = await consulta.listar({
        pagina: 1,
        porPagina: 10,
        status: 'pendente',
        tipo: 'cliente',
      });
      expect(pendentesDeCliente.itens.map((a) => a.valor)).toEqual(['A']);
    });

    it('a busca acha pela grafia, a mais parecida na frente', async () => {
      await inserir([{ valor: 'CLINICA NOVA SUL' }, { valor: 'NOVA' }, { valor: 'OUTRA' }]);

      const r = await new DrizzleConsultaAvisos(db).listar({
        pagina: 1,
        porPagina: 10,
        busca: 'nova',
      });

      expect(r.itens.map((a) => a.valor)).toEqual(['NOVA', 'CLINICA NOVA SUL']);
    });

    it('decide e devolve quem decidiu', async () => {
      const usuarioId = await criarUsuario();
      const [aviso] = await inserir([{ valor: 'A' }]);
      const consulta = new DrizzleConsultaAvisos(db);

      await consulta.decidir(aviso?.id ?? '', {
        status: 'ignorado',
        decididoPorId: usuarioId,
        motivo: 'teste',
        em: agora,
      });

      expect(await consulta.obter(aviso?.id ?? '')).toMatchObject({
        status: 'ignorado',
        motivo: 'teste',
        decididoEm: agora,
        decididoPor: { id: usuarioId, nome: 'Maria' },
      });
    });
  });

  describe('DrizzleParametrosIngestaoRepository', () => {
    it('salva e lê de volta', async () => {
      const repo = new DrizzleParametrosIngestaoRepository(db);
      await repo.salvar({
        travaRemocaoMinimo: 7,
        travaRemocaoFator: 1.5,
        retencaoLinhasBrutasDias: 30,
      });
      await repo.salvar({
        travaRemocaoMinimo: 8,
        travaRemocaoFator: 1.5,
        retencaoLinhasBrutasDias: 30,
      });
      expect(await repo.obter()).toEqual({
        travaRemocaoMinimo: 8,
        travaRemocaoFator: 1.5,
        retencaoLinhasBrutasDias: 30,
      });
    });

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
