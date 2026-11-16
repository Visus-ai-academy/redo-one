import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { DrizzleTurnosRepository } from './drizzle-turnos.repository';
import type { DadosTurno } from './turno';

// Roda contra um Postgres de verdade; sem TEST_DATABASE_URL, fica "skipped".
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleTurnosRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleTurnosRepository;
  let neuro: string;
  let tc: string;
  let medico: string;

  const turno = (extra: Partial<DadosTurno> = {}): DadosTurno => ({
    nome: 'Manhã',
    tipo: 'fixo',
    horarioInicio: '07:00',
    horarioFim: '13:00',
    frenteIds: [],
    descricao: null,
    cor: null,
    ordem: 0,
    ativo: true,
    ...extra,
  });

  const alocar = (
    turnoId: string,
    frenteId: string,
    extra: Partial<typeof schema.alocacoes.$inferInsert> = {},
  ) =>
    db.insert(schema.alocacoes).values({
      medicoId: medico,
      turnoId,
      frenteId,
      diasSemana: [1, 2, 3],
      horarioInicio: '07:00',
      horarioFim: '13:00',
      dataInicio: '2026-01-01',
      ...extra,
    });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    repo = new DrizzleTurnosRepository(db);
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table turnos, frentes_escala, especialidades, modalidades, medicos, usuarios, papeis, tipos_ausencia cascade`,
    );
    const [e] = await db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning();
    const [m] = await db.insert(schema.modalidades).values({ codigo: 'CT' }).returning();
    const frentes = await db
      .insert(schema.frentesEscala)
      .values([
        { tipo: 'especialidade', especialidadeId: e?.id, rotulo: 'NEURO', ordem: 2 },
        { tipo: 'modalidade', modalidadeId: m?.id, rotulo: 'TC', ordem: 1 },
      ])
      .returning();
    neuro = frentes[0]?.id ?? '';
    tc = frentes[1]?.id ?? '';
    const [med] = await db
      .insert(schema.medicos)
      .values({ nome: 'Ana Reis', chaveNormalizada: 'ana reis' })
      .returning();
    medico = med?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('grava o turno com as frentes e lê com elas pela ordem da frente', async () => {
    const id = await repo.criar(turno({ frenteIds: [neuro, tc], cor: '#123456' }));

    expect(await repo.buscar(id)).toEqual({
      id,
      nome: 'Manhã',
      tipo: 'fixo',
      horarioInicio: '07:00',
      horarioFim: '13:00',
      frentes: [
        { id: tc, rotulo: 'TC' },
        { id: neuro, rotulo: 'NEURO' },
      ],
      descricao: null,
      cor: '#123456',
      ordem: 0,
      ativo: true,
    });
  });

  it('editar troca o conjunto de frentes', async () => {
    const id = await repo.criar(turno({ frenteIds: [neuro, tc] }));

    await repo.atualizar(id, turno({ nome: 'Matutino', frenteIds: [neuro] }));

    expect(await repo.buscar(id)).toMatchObject({ nome: 'Matutino', frentes: [{ id: neuro }] });
  });

  it('lista por ordem e nome, com busca, ativo, paginação e turno sem frente', async () => {
    await repo.criar(turno({ nome: 'Tarde', ordem: 1, frenteIds: [tc] }));
    await repo.criar(turno({ nome: 'Manhã', ordem: 1, descricao: 'Matutino' }));
    await repo.criar(turno({ nome: 'Lista', tipo: 'lista', ordem: 0, ativo: false }));

    const pagina = await repo.listar({ pagina: 1, porPagina: 2 });
    expect(pagina.total).toBe(3);
    expect(pagina.itens.map((t) => [t.nome, t.frentes.length])).toEqual([
      ['Lista', 0],
      ['Manhã', 0],
    ]);
    expect((await repo.listar({ pagina: 2, porPagina: 2 })).itens[0]).toMatchObject({
      nome: 'Tarde',
      frentes: [{ id: tc, rotulo: 'TC' }],
    });
    expect((await repo.listar({ ativo: true, pagina: 1, porPagina: 10 })).total).toBe(2);
    expect(
      (await repo.listar({ busca: 'matu', pagina: 1, porPagina: 10 })).itens.map((t) => t.nome),
    ).toEqual(['Manhã']);
  });

  it('acha por nome sem diferenciar maiúsculas e diz quais frentes existem', async () => {
    const id = await repo.criar(turno());

    expect(await repo.buscarPorNome('MANHÃ')).toEqual({ id });
    expect(await repo.frentes([])).toEqual([]);
    expect(
      (await repo.frentes([neuro, '00000000-0000-0000-0000-000000000000'])).map((f) => f.id),
    ).toEqual([neuro]);
  });

  it('alocações vigentes: sem fim ou com fim a partir de hoje, só do turno', async () => {
    const id = await repo.criar(turno({ frenteIds: [neuro, tc] }));
    const outro = await repo.criar(turno({ nome: 'Tarde', frenteIds: [tc] }));
    await alocar(id, neuro);
    await alocar(id, tc, {
      horarioInicio: '08:00',
      horarioFim: '12:00',
      dataFim: '2026-11-15',
      gratificado: true,
    });
    await alocar(id, tc, { dataFim: '2026-11-14' });
    await alocar(outro, tc);

    const vigentes = await repo.alocacoesVigentes(id, '2026-11-15');
    expect(vigentes).toHaveLength(2);
    expect(vigentes).toEqual(
      expect.arrayContaining([
        { frenteId: neuro, horarioInicio: '07:00', horarioFim: '13:00', gratificado: false },
        { frenteId: tc, horarioInicio: '08:00', horarioFim: '12:00', gratificado: true },
      ]),
    );
  });

  it('exclui o turno livre, levando as frentes dele', async () => {
    const id = await repo.criar(turno({ frenteIds: [neuro] }));

    expect(await repo.excluir(id)).toBe(true);
    expect(await repo.buscar(id)).toBeNull();
    expect(await db.select().from(schema.turnosFrentes)).toEqual([]);
  });

  it('não exclui turno com alocação (nem que já acabou)', async () => {
    const id = await repo.criar(turno({ frenteIds: [neuro] }));
    await alocar(id, neuro, { dataFim: '2026-02-01' });

    expect(await repo.excluir(id)).toBe(false);
    expect(await repo.buscar(id)).not.toBeNull();
  });

  it('não exclui turno do recorte de uma gestora', async () => {
    const id = await repo.criar(turno());
    const [papel] = await db.insert(schema.papeis).values({ nome: 'Gestão de escala' }).returning();
    const [usuario] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Carla Lima', email: 'carla@empresa.com.br', papelId: papel?.id ?? '' })
      .returning();
    await db
      .insert(schema.usuariosEscoposEscala)
      .values({ usuarioId: usuario?.id ?? '', turnoId: id });

    expect(await repo.excluir(id)).toBe(false);
    expect(await repo.buscar(id)).not.toBeNull();
  });
});
