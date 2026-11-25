import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleCompetenciasRepository } from './drizzle-competencias.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleCompetenciasRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleCompetenciasRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    await runMigrations({ pgPool: pool });
    repo = new DrizzleCompetenciasRepository(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table competencias, laudos, importacoes cascade`);
    await db.execute(sql`delete from graphile_worker._private_jobs`);
    await db.delete(schema.usuarios).where(sql`${schema.usuarios.email} like 'competencias-%'`);
  });

  afterAll(async () => {
    await pool.end();
  });

  const status = async () =>
    (await db.select().from(schema.competencias)).map((c) => [c.competencia, c.status]).sort();

  it('lista as fechadas e as abertas com a importação travada, não as outras abertas', async () => {
    await db.insert(schema.competencias).values([
      { competencia: '2026-08', status: 'fechada', fechadaEm: new Date() },
      { competencia: '2026-09', status: 'aberta', importacaoTravadaEm: new Date() },
      { competencia: '2026-10', status: 'aberta' },
    ]);

    expect((await repo.listar()).sort()).toEqual(['2026-08', '2026-09']);
  });

  it('garante como aberta só as que não têm linha, e de novo não muda nada', async () => {
    await db.insert(schema.competencias).values({ competencia: '2026-09', status: 'fechada' });

    await repo.garantir(['2026-09', '2026-10', '2026-11', '2026-10']);
    await repo.garantir(['2026-09', '2026-10', '2026-11']);

    expect(await status()).toEqual([
      ['2026-09', 'fechada'],
      ['2026-10', 'aberta'],
      ['2026-11', 'aberta'],
    ]);
  });

  it('garantir sem competências não faz nada', async () => {
    await repo.garantir([]);

    expect(await status()).toEqual([]);
  });

  it('recusa status fora de aberta e fechada', async () => {
    await expect(
      db.execute(sql`insert into competencias (competencia, status) values ('2026-10', 'aberto')`),
    ).rejects.toThrow();
  });

  const usuario = async (nome: string) => {
    const [u] = await db
      .insert(schema.usuarios)
      .values({ nome, email: `competencias-${Math.random()}@exemplo.com` })
      .returning();
    return u?.id ?? '';
  };

  describe('lista paginada', () => {
    const laudos = async (
      linhas: { competencia: string; volume: number; removido?: boolean }[],
    ) => {
      const [importacao] = await db
        .insert(schema.importacoes)
        .values({ origem: 'mobilemed' })
        .returning();
      await db.insert(schema.laudos).values(
        linhas.map((l, i) => ({
          identidade: `id-${Math.random()}-${i}`,
          hashConteudo: 'h',
          importacaoId: importacao?.id ?? '',
          origem: 'normal' as const,
          empresaOrigem: 'CLINICA',
          pacienteChave: 'p',
          estudo: 'TC',
          modalidadeOrigem: 'CT',
          prioridadeOrigem: 'Rotina',
          volume: l.volume,
          status: 'Assinado',
          dataRealizacao: new Date('2026-10-05T12:00:00Z'),
          dataLaudo: new Date('2026-10-05T12:00:00Z'),
          diaLaudo: '2026-10-05',
          competencia: l.competencia,
          removidoEm: l.removido ? new Date() : null,
        })),
      );
    };

    it('da mais nova para a mais antiga, com autores, trava e laudos e volume de cada uma', async () => {
      const ana = await usuario('Ana');
      const bia = await usuario('Bia');
      const fechadaEm = new Date('2026-10-10T13:00:00Z');
      await db.insert(schema.competencias).values([
        {
          competencia: '2026-09',
          status: 'fechada',
          fechadaEm,
          fechadaPorLegado: 'claude-code',
          reabertaEm: fechadaEm,
          reabertaPorId: bia,
          importacaoTravadaEm: fechadaEm,
          importacaoTravadaPorId: ana,
          observacoes: 'do dashboards-one',
        },
        { competencia: '2026-10', status: 'fechada', fechadaEm, fechadaPorId: ana },
        { competencia: '2026-11', status: 'aberta' },
      ]);
      await laudos([
        { competencia: '2026-10', volume: 1 },
        { competencia: '2026-10', volume: 2.5 },
        { competencia: '2026-10', volume: 9, removido: true },
        { competencia: '2026-09', volume: 3 },
      ]);

      const pagina = await repo.listarPagina({ pagina: 1, porPagina: 2 });
      expect(pagina.total).toBe(3);
      expect(pagina.itens).toEqual([
        {
          competencia: '2026-11',
          status: 'aberta',
          fechadaEm: null,
          fechadaPor: null,
          reabertaEm: null,
          reabertaPor: null,
          importacaoTravadaEm: null,
          importacaoTravadaPor: null,
          observacoes: null,
          laudos: 0,
          volume: 0,
        },
        {
          competencia: '2026-10',
          status: 'fechada',
          fechadaEm,
          fechadaPor: 'Ana',
          reabertaEm: null,
          reabertaPor: null,
          importacaoTravadaEm: null,
          importacaoTravadaPor: null,
          observacoes: null,
          laudos: 2,
          volume: 3.5,
        },
      ]);

      const [setembro] = (await repo.listarPagina({ pagina: 2, porPagina: 2 })).itens;
      expect(setembro).toMatchObject({
        competencia: '2026-09',
        fechadaPor: 'claude-code',
        reabertaPor: 'Bia',
        importacaoTravadaPor: 'Ana',
        observacoes: 'do dashboards-one',
        laudos: 1,
        volume: 3,
      });
    });
  });

  describe('ações', () => {
    const linha = async (competencia: string) =>
      (await db.select().from(schema.competencias).where(sql`competencia = ${competencia}`))[0];

    it('obter devolve status e trava, ou nulo sem linha', async () => {
      await db.insert(schema.competencias).values({
        competencia: '2026-10',
        status: 'aberta',
        importacaoTravadaEm: new Date(),
      });
      expect(await repo.obter('2026-10')).toEqual({ status: 'aberta', importacaoTravada: true });
      expect(await repo.obter('2026-11')).toBeNull();
    });

    it('a última fechada é a mais recente com status fechada', async () => {
      expect(await repo.ultimaFechada()).toBeNull();
      await db.insert(schema.competencias).values([
        { competencia: '2026-08', status: 'fechada' },
        { competencia: '2026-09', status: 'fechada' },
        { competencia: '2026-10', status: 'aberta', importacaoTravadaEm: new Date() },
      ]);
      expect(await repo.ultimaFechada()).toBe('2026-09');
    });

    it('fecha só a aberta e reabre só a fechada, guardando quem e quando', async () => {
      const ana = await usuario('Ana');
      const em = new Date('2026-11-24T15:00:00Z');
      await db.insert(schema.competencias).values({ competencia: '2026-10', status: 'aberta' });

      expect(await repo.fechar('2026-10', { usuarioId: ana, em })).toBe(true);
      expect(await repo.fechar('2026-10', { usuarioId: ana, em })).toBe(false);
      expect(await linha('2026-10')).toMatchObject({
        status: 'fechada',
        fechadaEm: em,
        fechadaPorId: ana,
      });

      const depois = new Date('2026-11-25T15:00:00Z');
      expect(await repo.reabrir('2026-10', { usuarioId: ana, em: depois })).toBe(true);
      expect(await repo.reabrir('2026-10', { usuarioId: ana, em: depois })).toBe(false);
      expect(await linha('2026-10')).toMatchObject({
        status: 'aberta',
        fechadaEm: em,
        reabertaEm: depois,
        reabertaPorId: ana,
      });
      expect(await repo.fechar('2026-09', { usuarioId: ana, em })).toBe(false);
    });

    it('fechar de novo troca o autor do texto do dashboards-one pelo usuário', async () => {
      const ana = await usuario('Ana');
      const em = new Date('2026-11-24T15:00:00Z');
      await db
        .insert(schema.competencias)
        .values({ competencia: '2026-10', status: 'aberta', fechadaPorLegado: 'claude-code' });

      await repo.fechar('2026-10', { usuarioId: ana, em });

      expect(await linha('2026-10')).toMatchObject({ fechadaPorId: ana, fechadaPorLegado: null });
    });

    it('trava e destrava a importação sem mexer no status', async () => {
      const ana = await usuario('Ana');
      const em = new Date('2026-11-24T15:00:00Z');
      await db.insert(schema.competencias).values({
        competencia: '2026-10',
        status: 'fechada',
        importacaoTravadaPorLegado: 'x',
      });

      expect(await repo.travarImportacao('2026-10', { usuarioId: ana, em })).toBe(true);
      expect(await repo.travarImportacao('2026-10', { usuarioId: ana, em })).toBe(false);
      expect(await linha('2026-10')).toMatchObject({
        status: 'fechada',
        importacaoTravadaEm: em,
        importacaoTravadaPorId: ana,
        importacaoTravadaPorLegado: null,
      });

      expect(await repo.destravarImportacao('2026-10')).toBe(true);
      expect(await repo.destravarImportacao('2026-10')).toBe(false);
      expect(await linha('2026-10')).toMatchObject({
        status: 'fechada',
        importacaoTravadaEm: null,
        importacaoTravadaPorId: null,
        importacaoTravadaPorLegado: null,
      });
    });

    describe('destravar e reabrir enfileiram o recálculo e a reclassificação', () => {
      const jobs = async () =>
        (
          await db.execute<{ tarefa: string; payload: unknown; fila: string | null }>(
            sql`select t.identifier as tarefa, j.payload, q.queue_name as fila
                from graphile_worker._private_jobs j
                join graphile_worker._private_tasks t on t.id = j.task_id
                left join graphile_worker._private_job_queues q on q.id = j.job_queue_id
                order by j.id`,
          )
        ).rows;

      it('de todos os laudos, junto com a destrava; sem destrava, sem job', async () => {
        await db
          .insert(schema.competencias)
          .values({ competencia: '2026-10', status: 'aberta', importacaoTravadaEm: new Date() });

        expect(await repo.destravarImportacao('2026-10')).toBe(true);
        expect(await repo.destravarImportacao('2026-10')).toBe(false);

        expect(await jobs()).toEqual([
          {
            tarefa: 'ingestao.recalcular-competencias',
            payload: { clienteIds: null },
            fila: 'ingestao',
          },
          {
            tarefa: 'ingestao.reclassificar-tipificacao',
            payload: { clienteIds: null },
            fila: 'ingestao',
          },
        ]);
      });

      it('reabrir reclassifica a tipificação de todos, junto com a reabertura; sem reabrir, sem job', async () => {
        const ana = await usuario('Ana');
        await db.insert(schema.competencias).values({ competencia: '2026-10', status: 'fechada' });

        expect(await repo.reabrir('2026-10', { usuarioId: ana, em: new Date() })).toBe(true);
        expect(await repo.reabrir('2026-10', { usuarioId: ana, em: new Date() })).toBe(false);

        expect(await jobs()).toEqual([
          {
            tarefa: 'ingestao.reclassificar-tipificacao',
            payload: { clienteIds: null },
            fila: 'ingestao',
          },
        ]);
      });

      it('se o job não entra, a destrava também não', async () => {
        await db
          .insert(schema.competencias)
          .values({ competencia: '2026-10', status: 'aberta', importacaoTravadaEm: new Date() });

        await db
          .transaction(async (tx) => {
            // Derruba o add_job só nesta transação: enfileirar falha.
            const {
              rows: [funcao],
            } = await tx.execute<{ assinatura: string }>(
              sql`select oid::regprocedure::text as assinatura from pg_proc
                  where proname = 'add_job' and pronamespace = 'graphile_worker'::regnamespace`,
            );
            await tx.execute(
              sql.raw(`alter function ${funcao?.assinatura} rename to add_job_fora`),
            );
            const noTx = new DrizzleCompetenciasRepository(tx as unknown as Database);

            await expect(noTx.destravarImportacao('2026-10')).rejects.toThrow();
            expect((await noTx.obter('2026-10'))?.importacaoTravada).toBe(true);
            tx.rollback();
          })
          .catch((e) => {
            if (!String(e).includes('Rollback')) throw e;
          });

        expect((await repo.obter('2026-10'))?.importacaoTravada).toBe(true);
        expect(await jobs()).toEqual([]);
      });
    });
  });
});
