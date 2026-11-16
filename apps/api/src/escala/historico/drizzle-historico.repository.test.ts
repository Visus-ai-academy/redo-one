import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import type { EscopoEscala } from '../escopo/escopo';
import { DrizzleHistoricoEscalaRepository } from './drizzle-historico.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('repositório do histórico da escala', () => {
  let pool: Pool;
  let db: Database;
  let carla: string;
  const m: Record<'ana' | 'bruno' | 'caio', string> = { ana: '', bruno: '', caio: '' };
  let manha: string;
  let tarde: string;
  let neuro: string;
  let tc: string;
  /** Evento por apelido → id. */
  const ev: Record<string, string> = {};
  let recorte: EscopoEscala;

  const pagina = { pagina: 1, porPagina: 50 };
  const apelidos = (itens: { id: string }[]) =>
    itens.map((i) => Object.keys(ev).find((k) => ev[k] === i.id));

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table eventos_auditoria, alocacoes, medicos, turnos, frentes_escala, especialidades, usuarios, papeis cascade`,
    );
    const [papel] = await db.insert(schema.papeis).values({ nome: 'Gestão de escala' }).returning();
    const [u] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Carla Lima', email: 'carla@empresa.com.br', papelId: papel?.id ?? '' })
      .returning();
    carla = u?.id ?? '';
    const medicos = await db
      .insert(schema.medicos)
      .values([
        { nome: 'Ana Reis', chaveNormalizada: 'ana reis' },
        { nome: 'Bruno Alves', chaveNormalizada: 'bruno alves' },
        { nome: 'Caio Prado', chaveNormalizada: 'caio prado' },
      ])
      .returning();
    m.ana = medicos[0]?.id ?? '';
    m.bruno = medicos[1]?.id ?? '';
    m.caio = medicos[2]?.id ?? '';
    const [tm, tt] = await db
      .insert(schema.turnos)
      .values([
        { nome: 'Manhã', horarioInicio: '07:00', horarioFim: '13:00' },
        { nome: 'Tarde', horarioInicio: '13:00', horarioFim: '19:00' },
      ])
      .returning();
    manha = tm?.id ?? '';
    tarde = tt?.id ?? '';
    const [en, ec] = await db
      .insert(schema.especialidades)
      .values([{ nome: 'NEUROLOGIA' }, { nome: 'CORPO' }])
      .returning();
    const [fn, fc] = await db
      .insert(schema.frentesEscala)
      .values([
        { tipo: 'especialidade', especialidadeId: en?.id ?? '', rotulo: 'NEURO' },
        { tipo: 'especialidade', especialidadeId: ec?.id ?? '', rotulo: 'TC' },
      ])
      .returning();
    neuro = fn?.id ?? '';
    tc = fc?.id ?? '';
    // Caio trabalha na Manhã/TC: entra no recorte pelo turno.
    await db.insert(schema.alocacoes).values({
      medicoId: m.caio,
      turnoId: manha,
      frenteId: tc,
      diasSemana: [1, 2, 3],
      horarioInicio: '07:00',
      horarioFim: '13:00',
      dataInicio: '2026-01-01',
    });
    recorte = { turnoIds: new Set([manha]), frenteIds: new Set([neuro]) };

    const eventos: Array<[string, Partial<typeof schema.eventosAuditoria.$inferInsert>]> = [
      [
        'alocAnaNeuro',
        {
          entidade: 'alocacao',
          acao: 'criado',
          depois: { medicoId: m.ana, turnoId: tarde, frenteId: neuro, produtividade: 30 },
        },
      ],
      [
        'alocBrunoTardeTcRemovida',
        {
          entidade: 'alocacao',
          acao: 'removido',
          antes: { medicoId: m.bruno, turnoId: tarde, frenteId: tc },
        },
      ],
      [
        'ajusteBrunoManha',
        {
          entidade: 'ajuste_produtividade',
          acao: 'criado',
          depois: { medicoId: m.bruno, turnoId: manha, frenteId: tc },
        },
      ],
      [
        'ausBrunoTardeTc',
        {
          entidade: 'ausencia',
          acao: 'criado',
          depois: { medicoId: m.bruno, turnoIds: [tarde], frenteIds: [tc] },
        },
      ],
      [
        'ausAnaNeuro',
        {
          entidade: 'ausencia',
          acao: 'criado',
          depois: { medicoId: m.ana, turnoIds: [], frenteIds: [neuro] },
        },
      ],
      [
        'ausCaioTodas',
        {
          entidade: 'ausencia',
          acao: 'criado',
          depois: { medicoId: m.caio, turnoIds: [], frenteIds: [] },
        },
      ],
      [
        'ausBrunoTodas',
        {
          entidade: 'ausencia',
          acao: 'criado',
          depois: { medicoId: m.bruno, turnoIds: [], frenteIds: [] },
        },
      ],
      [
        'ausCaioSoTarde',
        {
          entidade: 'ausencia',
          acao: 'criado',
          depois: { medicoId: m.caio, turnoIds: [tarde], frenteIds: [] },
        },
      ],
      [
        'turno',
        {
          entidade: 'turno',
          entidadeId: manha,
          acao: 'atualizado',
          antes: { nome: 'Manha' },
          depois: { nome: 'Manhã' },
        },
      ],
      ['outroContexto', { entidade: 'medico', acao: 'criado', depois: { medicoId: m.ana } }],
      [
        'cargaLegado',
        {
          entidade: 'ausencia',
          acao: 'criado',
          atorTipo: 'sistema',
          atorId: null,
          depois: {
            medicoId: m.caio,
            turnoIds: [manha],
            frenteIds: [],
            usuarioLegado: 'Maria Souza',
          },
        },
      ],
    ];
    for (const [i, [apelido, evento]] of eventos.entries()) {
      const [linha] = await db
        .insert(schema.eventosAuditoria)
        .values({
          ocorridoEm: new Date(Date.UTC(2026, 10, 1 + i, 15)),
          atorTipo: 'usuario',
          atorId: carla,
          entidadeId: crypto.randomUUID(),
          entidade: '',
          acao: '',
          ...evento,
        })
        .returning();
      ev[apelido] = linha?.id ?? '';
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it('sem recorte: só eventos da escala, do mais novo, com ator e médico', async () => {
    const repo = new DrizzleHistoricoEscalaRepository(db);
    const { itens, total } = await repo.listar({ ...pagina, escopo: null });

    expect(total).toBe(10);
    expect(apelidos(itens)).toEqual([
      'cargaLegado',
      'turno',
      'ausCaioSoTarde',
      'ausBrunoTodas',
      'ausCaioTodas',
      'ausAnaNeuro',
      'ausBrunoTardeTc',
      'ajusteBrunoManha',
      'alocBrunoTardeTcRemovida',
      'alocAnaNeuro',
    ]);
    expect(itens.at(-1)).toEqual({
      id: ev.alocAnaNeuro,
      ocorridoEm: new Date('2026-11-01T15:00:00Z'),
      ator: { tipo: 'usuario', nome: 'Carla Lima' },
      entidade: 'alocacao',
      entidadeId: expect.any(String),
      acao: 'criado',
      medico: { id: m.ana, nome: 'Ana Reis' },
      antes: null,
      depois: { medicoId: m.ana, turnoId: tarde, frenteId: neuro, produtividade: 30 },
    });
    expect(itens.find((i) => i.id === ev.alocBrunoTardeTcRemovida)?.medico).toEqual({
      id: m.bruno,
      nome: 'Bruno Alves',
    });
    expect(itens[0]?.ator).toEqual({ tipo: 'sistema', nome: 'Maria Souza' });
    expect(itens[1]?.medico).toBeNull();
  });

  it('com recorte: alocação/ajuste pelo turno ou frente; ausência pelo recorte ou pela alocação do médico; cadastros nunca', async () => {
    const repo = new DrizzleHistoricoEscalaRepository(db);
    const { itens, total } = await repo.listar({ ...pagina, escopo: recorte });

    expect(apelidos(itens)).toEqual([
      'cargaLegado',
      'ausCaioTodas',
      'ausAnaNeuro',
      'ajusteBrunoManha',
      'alocAnaNeuro',
    ]);
    expect(total).toBe(5);
  });

  it('recorte vazio não vê nada', async () => {
    const repo = new DrizzleHistoricoEscalaRepository(db);
    const vazio = { turnoIds: new Set<string>(), frenteIds: new Set<string>() };
    expect(await repo.listar({ ...pagina, escopo: vazio })).toEqual({ itens: [], total: 0 });
  });

  it('filtra por médico, entidade e período', async () => {
    const repo = new DrizzleHistoricoEscalaRepository(db);

    const doBruno = await repo.listar({ ...pagina, escopo: null, medicoId: m.bruno });
    expect(apelidos(doBruno.itens)).toEqual([
      'ausBrunoTodas',
      'ausBrunoTardeTc',
      'ajusteBrunoManha',
      'alocBrunoTardeTcRemovida',
    ]);

    const ausencias = await repo.listar({ ...pagina, escopo: recorte, entidade: 'ausencia' });
    expect(apelidos(ausencias.itens)).toEqual(['cargaLegado', 'ausCaioTodas', 'ausAnaNeuro']);

    const periodo = await repo.listar({
      ...pagina,
      escopo: null,
      de: new Date('2026-11-02T15:00:00Z'),
      ateExclusivo: new Date('2026-11-04T15:00:00Z'),
    });
    expect(apelidos(periodo.itens)).toEqual(['ajusteBrunoManha', 'alocBrunoTardeTcRemovida']);
  });

  it('pagina mantendo o total', async () => {
    const repo = new DrizzleHistoricoEscalaRepository(db);
    const { itens, total } = await repo.listar({ pagina: 2, porPagina: 3, escopo: null });
    expect(total).toBe(10);
    expect(apelidos(itens)).toEqual(['ausBrunoTodas', 'ausCaioTodas', 'ausAnaNeuro']);
  });
});
