import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { EventoAuditoria } from '../../auditoria/auditoria';
import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { DrizzleCadastrosEscopoRepository } from './drizzle-cadastros-escopo.repository';

const url = process.env.TEST_DATABASE_URL;
const NAO_EXISTE = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!url)('cadastros consultados pelo recorte da escala', () => {
  let pool: Pool;
  let db: Database;
  let usuarioId: string;
  let manha: string;
  let tarde: string;
  let neuro: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table eventos_auditoria, usuarios_escopos_escala, turnos, frentes_escala, especialidades, usuarios, papeis cascade`,
    );
    const [usuario] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Carla Lima', email: 'carla@empresa.com.br' })
      .returning();
    usuarioId = usuario?.id ?? '';
    const [t, m] = await db
      .insert(schema.turnos)
      .values([
        { nome: 'Tarde', horarioInicio: '13:00', horarioFim: '19:00', ordem: 2 },
        { nome: 'Manhã', horarioInicio: '07:00', horarioFim: '13:00', ordem: 1 },
      ])
      .returning();
    manha = m?.id ?? '';
    tarde = t?.id ?? '';
    const [especialidade] = await db
      .insert(schema.especialidades)
      .values({ nome: 'NEURO' })
      .returning();
    const [frente] = await db
      .insert(schema.frentesEscala)
      .values({ tipo: 'especialidade', especialidadeId: especialidade?.id ?? '' })
      .returning();
    neuro = frente?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('diz se o usuário existe', async () => {
    const repo = new DrizzleCadastrosEscopoRepository(db);
    expect(await repo.usuarioExiste(usuarioId)).toBe(true);
    expect(await repo.usuarioExiste(NAO_EXISTE)).toBe(false);
  });

  it('turnos e frentes que existem, na ordem da escala, com o rótulo da frente', async () => {
    const repo = new DrizzleCadastrosEscopoRepository(db);
    expect(await repo.turnos([tarde, NAO_EXISTE, manha])).toEqual([
      { id: manha, nome: 'Manhã' },
      { id: tarde, nome: 'Tarde' },
    ]);
    expect(await repo.frentes([neuro, NAO_EXISTE])).toEqual([{ id: neuro, nome: 'NEURO' }]);
    expect(await repo.turnos([])).toEqual([]);
  });

  describe('gravarRecorte', () => {
    const evento = (atorId: string): EventoAuditoria => ({
      ator: { tipo: 'usuario', id: atorId },
      entidade: 'escopo_escala',
      entidadeId: usuarioId,
      acao: 'definido',
      depois: { turnoIds: [manha] },
      em: new Date('2026-11-16T12:00:00Z'),
    });
    const recorte = () =>
      db
        .select({
          turnoId: schema.usuariosEscoposEscala.turnoId,
          frenteId: schema.usuariosEscoposEscala.frenteId,
        })
        .from(schema.usuariosEscoposEscala);

    it('troca o recorte inteiro e grava o evento junto', async () => {
      const repo = new DrizzleCadastrosEscopoRepository(db);
      await repo.gravarRecorte(usuarioId, { turnoIds: [tarde], frenteIds: [neuro] }, [
        evento(usuarioId),
      ]);
      await repo.gravarRecorte(usuarioId, { turnoIds: [manha], frenteIds: [] }, [
        evento(usuarioId),
      ]);

      expect(await recorte()).toEqual([{ turnoId: manha, frenteId: null }]);
      const eventos = await db.select().from(schema.eventosAuditoria);
      expect(eventos).toHaveLength(2);
      expect(eventos[0]).toMatchObject({ entidade: 'escopo_escala', entidadeId: usuarioId });
    });

    it('se o evento falha, o recorte fica como estava', async () => {
      const repo = new DrizzleCadastrosEscopoRepository(db);
      await repo.gravarRecorte(usuarioId, { turnoIds: [tarde], frenteIds: [] }, []);

      await expect(
        repo.gravarRecorte(usuarioId, { turnoIds: [manha], frenteIds: [] }, [evento('nao-e-uuid')]),
      ).rejects.toThrow();

      expect(await recorte()).toEqual([{ turnoId: tarde, frenteId: null }]);
      expect(await db.select().from(schema.eventosAuditoria)).toEqual([]);
    });
  });
});
