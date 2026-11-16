import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { DrizzleFrentesRepository } from './drizzle-frentes.repository';
import type { DadosFrente } from './frentes.repository';

// Roda contra um Postgres de verdade; sem TEST_DATABASE_URL, fica "skipped".
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleFrentesRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleFrentesRepository;
  let neuro: string;
  let msk: string;
  let ct: string;

  const frente = (extra: Partial<DadosFrente>): DadosFrente => ({
    tipo: 'especialidade',
    especialidadeId: null,
    modalidadeId: null,
    rotulo: 'X',
    descricao: null,
    cor: null,
    ordem: 0,
    ativo: true,
    ...extra,
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    repo = new DrizzleFrentesRepository(db);
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table frentes_escala, turnos, especialidades, modalidades, usuarios, papeis, medicos, tipos_ausencia cascade`,
    );
    const [n, m] = await db
      .insert(schema.especialidades)
      .values([{ nome: 'NEURO' }, { nome: 'MUSCULOESQUELETICO' }])
      .returning();
    const [c] = await db.insert(schema.modalidades).values({ codigo: 'CT' }).returning();
    neuro = n?.id ?? '';
    msk = m?.id ?? '';
    ct = c?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('grava e lê com o nome do destino no catálogo', async () => {
    const id = await repo.criar(
      frente({ especialidadeId: neuro, rotulo: 'NEURO', cor: '#123456' }),
    );
    const idCt = await repo.criar(frente({ tipo: 'modalidade', modalidadeId: ct, rotulo: 'TC' }));

    expect(await repo.buscar(id)).toEqual({
      id,
      tipo: 'especialidade',
      especialidadeId: neuro,
      modalidadeId: null,
      rotulo: 'NEURO',
      destinoNome: 'NEURO',
      descricao: null,
      cor: '#123456',
      ordem: 0,
      ativo: true,
    });
    expect(await repo.buscar(idCt)).toMatchObject({ rotulo: 'TC', destinoNome: 'CT' });
  });

  it('lista por ordem e rótulo, com busca, ativo e paginação', async () => {
    await repo.criar(frente({ especialidadeId: neuro, rotulo: 'NEURO', ordem: 2 }));
    await repo.criar(frente({ especialidadeId: msk, rotulo: 'MSK', ordem: 1, descricao: 'Osso' }));
    await repo.criar(
      frente({ tipo: 'modalidade', modalidadeId: ct, rotulo: 'TC', ordem: 1, ativo: false }),
    );

    const pagina = await repo.listar({ pagina: 1, porPagina: 2 });
    expect(pagina.total).toBe(3);
    expect(pagina.itens.map((f) => [f.rotulo, f.destinoNome])).toEqual([
      ['MSK', 'MUSCULOESQUELETICO'],
      ['TC', 'CT'],
    ]);
    expect((await repo.listar({ pagina: 2, porPagina: 2 })).itens.map((f) => f.rotulo)).toEqual([
      'NEURO',
    ]);
    expect((await repo.listar({ ativo: false, pagina: 1, porPagina: 10 })).total).toBe(1);
    expect(
      (await repo.listar({ busca: 'osso', pagina: 1, porPagina: 10 })).itens.map((f) => f.rotulo),
    ).toEqual(['MSK']);
  });

  it('acha por rótulo (sem maiúsculas), por destino e o nome do destino', async () => {
    const id = await repo.criar(frente({ especialidadeId: neuro, rotulo: 'NEURO' }));

    expect(await repo.buscarPorRotulo('neuro')).toEqual({ id });
    expect(await repo.buscarPorDestino({ tipo: 'especialidade', id: neuro })).toEqual({
      id,
      rotulo: 'NEURO',
    });
    expect(await repo.buscarPorDestino({ tipo: 'especialidade', id: msk })).toBeNull();
    expect(await repo.nomeDoDestino({ tipo: 'modalidade', id: ct })).toBe('CT');
    expect(await repo.nomeDoDestino({ tipo: 'especialidade', id: ct })).toBeNull();
  });

  it('atualiza', async () => {
    const id = await repo.criar(frente({ especialidadeId: neuro, rotulo: 'NEURO' }));

    await repo.atualizar(id, frente({ especialidadeId: msk, rotulo: 'MSK', ordem: 4 }));

    expect(await repo.buscar(id)).toMatchObject({
      rotulo: 'MSK',
      destinoNome: 'MUSCULOESQUELETICO',
      ordem: 4,
    });
  });

  it('exclui a frente livre', async () => {
    const id = await repo.criar(frente({ especialidadeId: neuro, rotulo: 'NEURO' }));

    expect(await repo.excluir(id)).toBe(true);
    expect(await repo.buscar(id)).toBeNull();
  });

  it('diz se a frente está em uso por turno, alocação, ausência ou recorte', async () => {
    const [papel] = await db.insert(schema.papeis).values({ nome: 'Gestão de escala' }).returning();
    const [usuario] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Carla Lima', email: 'carla@empresa.com.br', papelId: papel?.id ?? '' })
      .returning();
    const [medico] = await db
      .insert(schema.medicos)
      .values({ nome: 'Ana Reis', chaveNormalizada: 'ana reis' })
      .returning();
    const [turno] = await db
      .insert(schema.turnos)
      .values({ nome: 'Manhã', horarioInicio: '07:00', horarioFim: '13:00' })
      .returning();
    const [tipo] = await db.insert(schema.tiposAusencia).values({ nome: 'Férias' }).returning();
    const [ausencia] = await db
      .insert(schema.ausencias)
      .values({
        medicoId: medico?.id ?? '',
        tipoId: tipo?.id ?? '',
        dataInicio: '2026-12-01',
        dataFim: '2026-12-10',
      })
      .returning();
    const [m2, m3] = await db
      .insert(schema.modalidades)
      .values([{ codigo: 'MR' }, { codigo: 'RX' }])
      .returning();
    const livre = await repo.criar(frente({ especialidadeId: neuro, rotulo: 'NEURO' }));
    const doTurno = await repo.criar(frente({ especialidadeId: msk, rotulo: 'MSK' }));
    const daAlocacao = await repo.criar(
      frente({ tipo: 'modalidade', modalidadeId: ct, rotulo: 'TC' }),
    );
    const daAusencia = await repo.criar(
      frente({ tipo: 'modalidade', modalidadeId: m2?.id ?? '', rotulo: 'RM' }),
    );
    const doRecorte = await repo.criar(
      frente({ tipo: 'modalidade', modalidadeId: m3?.id ?? '', rotulo: 'RX' }),
    );
    await db.insert(schema.turnosFrentes).values({ turnoId: turno?.id ?? '', frenteId: doTurno });
    await db.insert(schema.alocacoes).values({
      medicoId: medico?.id ?? '',
      turnoId: turno?.id ?? '',
      frenteId: daAlocacao,
      diasSemana: [1],
      horarioInicio: '07:00',
      horarioFim: '13:00',
      dataInicio: '2026-01-01',
    });
    await db
      .insert(schema.ausenciasFrentes)
      .values({ ausenciaId: ausencia?.id ?? '', frenteId: daAusencia });
    await db
      .insert(schema.usuariosEscoposEscala)
      .values({ usuarioId: usuario?.id ?? '', frenteId: doRecorte });

    expect(await repo.estaEmUso(livre)).toBe(false);
    for (const id of [doTurno, daAlocacao, daAusencia, doRecorte]) {
      expect(await repo.estaEmUso(id)).toBe(true);
    }
  });

  it('não exclui frente de um turno', async () => {
    const id = await repo.criar(frente({ especialidadeId: neuro, rotulo: 'NEURO' }));
    const [turno] = await db
      .insert(schema.turnos)
      .values({ nome: 'Manhã', horarioInicio: '07:00', horarioFim: '13:00' })
      .returning();
    await db.insert(schema.turnosFrentes).values({ turnoId: turno?.id ?? '', frenteId: id });

    expect(await repo.excluir(id)).toBe(false);
    expect(await repo.buscar(id)).not.toBeNull();
  });

  it('não exclui frente do recorte de uma gestora (o banco apagaria o recorte em cascata)', async () => {
    const id = await repo.criar(frente({ especialidadeId: neuro, rotulo: 'NEURO' }));
    const [papel] = await db.insert(schema.papeis).values({ nome: 'Gestão de escala' }).returning();
    const [usuario] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Carla Lima', email: 'carla@empresa.com.br', papelId: papel?.id ?? '' })
      .returning();
    await db
      .insert(schema.usuariosEscoposEscala)
      .values({ usuarioId: usuario?.id ?? '', frenteId: id });

    expect(await repo.excluir(id)).toBe(false);
    expect(await repo.buscar(id)).not.toBeNull();
  });
});
