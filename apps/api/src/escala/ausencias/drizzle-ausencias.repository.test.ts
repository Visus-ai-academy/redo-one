import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { EventoAuditoria } from '../../auditoria/auditoria';
import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import type { NovaAusencia } from './ausencias.repository';
import { DrizzleAusenciasRepository } from './drizzle-ausencias.repository';

// Roda contra um Postgres de verdade; sem TEST_DATABASE_URL, fica "skipped".
const url = process.env.TEST_DATABASE_URL;

const EM = new Date('2026-11-16T12:00:00Z');
const evento = (id: string, acao: string, depois?: Record<string, unknown>): EventoAuditoria => ({
  ator: { tipo: 'usuario', id: ids.gestor },
  entidade: 'ausencia',
  entidadeId: id,
  acao,
  ...(depois ? { depois } : {}),
  em: EM,
});

const ids = {
  ana: '',
  bia: '',
  gestor: '',
  medicoUsuario: '',
  ferias: '',
  neuro: '',
  tc: '',
  manha: '',
  tarde: '',
};

describe.skipIf(!url)('DrizzleAusenciasRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleAusenciasRepository;

  const nova = (extra: Partial<NovaAusencia> = {}): NovaAusencia => ({
    id: randomUUID(),
    medicoId: ids.ana,
    tipoId: ids.ferias,
    dataInicio: '2026-12-01',
    dataFim: '2026-12-10',
    diasSemana: [],
    frenteIds: [],
    turnoIds: [],
    observacoes: null,
    situacao: 'aprovada',
    origem: 'gestor',
    solicitadaPorId: ids.gestor,
    ...extra,
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
    repo = new DrizzleAusenciasRepository(db);
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table ausencias, alocacoes, tipos_ausencia, frentes_escala, turnos, especialidades, usuarios, papeis, medicos cascade`,
    );
    const [ana, bia] = await db
      .insert(schema.medicos)
      .values([
        { nome: 'Ana Souza', chaveNormalizada: 'ana souza' },
        { nome: 'Bia Lima', chaveNormalizada: 'bia lima' },
      ])
      .returning();
    const [papel] = await db.insert(schema.papeis).values({ nome: 'Gestor' }).returning();
    const [gestor, medicoUsuario] = await db
      .insert(schema.usuarios)
      .values([
        { nome: 'Gestor', email: 'g@x.com', papelId: papel?.id ?? '' },
        { nome: 'Ana', email: 'a@x.com', papelId: papel?.id ?? '', medicoId: ana?.id ?? null },
      ])
      .returning();
    const [ferias] = await db
      .insert(schema.tiposAusencia)
      .values({ nome: 'Férias', cor: '#00AA00', soGestor: true, ativo: false })
      .returning();
    const [eNeuro, eTc] = await db
      .insert(schema.especialidades)
      .values([
        { nome: 'NEURO', ordem: 1 },
        { nome: 'TC', ordem: 0 },
      ])
      .returning();
    const [neuro, tc] = await db
      .insert(schema.frentesEscala)
      .values([
        { tipo: 'especialidade', especialidadeId: eNeuro?.id ?? '' },
        { tipo: 'especialidade', especialidadeId: eTc?.id ?? '' },
      ])
      .returning();
    const [manha, tarde] = await db
      .insert(schema.turnos)
      .values([
        { nome: 'Manhã', horarioInicio: '07:00', horarioFim: '13:00', ordem: 0 },
        { nome: 'Tarde', horarioInicio: '13:00', horarioFim: '19:00', ordem: 1 },
      ])
      .returning();
    Object.assign(ids, {
      ana: ana?.id,
      bia: bia?.id,
      gestor: gestor?.id,
      medicoUsuario: medicoUsuario?.id,
      ferias: ferias?.id,
      neuro: neuro?.id,
      tc: tc?.id,
      manha: manha?.id,
      tarde: tarde?.id,
    });
    // Ana: NEURO de manhã, fixa. Bia: TC à tarde, até out/2026.
    await db.insert(schema.alocacoes).values([
      {
        medicoId: ids.ana,
        turnoId: ids.manha,
        frenteId: ids.neuro,
        diasSemana: [1, 2, 3, 4, 5],
        horarioInicio: '07:00',
        horarioFim: '13:00',
        dataInicio: '2026-01-01',
      },
      {
        medicoId: ids.bia,
        turnoId: ids.tarde,
        frenteId: ids.tc,
        diasSemana: [1],
        horarioInicio: '13:00',
        horarioFim: '19:00',
        dataInicio: '2026-01-01',
        dataFim: '2026-10-31',
      },
    ]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('cria com frentes, turnos e eventos na mesma transação, e lê com os nomes', async () => {
    const a = nova({
      frenteIds: [ids.neuro, ids.tc],
      turnoIds: [ids.manha],
      diasSemana: [1, 3],
      observacoes: 'gripe',
    });

    await repo.criar([a], [evento(a.id, 'criada', { medicoId: ids.ana })]);

    expect(await repo.buscar(a.id)).toEqual({
      id: a.id,
      medico: { id: ids.ana, nome: 'Ana Souza' },
      tipo: { id: ids.ferias, nome: 'Férias', cor: '#00AA00' },
      dataInicio: '2026-12-01',
      dataFim: '2026-12-10',
      diasSemana: [1, 3],
      frentes: [
        { id: ids.tc, nome: 'TC' },
        { id: ids.neuro, nome: 'NEURO' },
      ],
      turnos: [{ id: ids.manha, nome: 'Manhã' }],
      situacao: 'aprovada',
      origem: 'gestor',
      observacoes: 'gripe',
      motivoRecusa: null,
      solicitadaPor: { id: ids.gestor, nome: 'Gestor' },
      revisadaPor: null,
      revisadaEm: null,
      criadoEm: expect.any(Date),
    });
    const eventos = await db
      .select()
      .from(schema.eventosAuditoria)
      .where(eq(schema.eventosAuditoria.entidadeId, a.id));
    expect(eventos).toMatchObject([
      { acao: 'criada', entidade: 'ausencia', atorId: ids.gestor, depois: { medicoId: ids.ana } },
    ]);
  });

  it('desfaz tudo se a gravação falhar no meio', async () => {
    const a = nova({ frenteIds: [randomUUID()] });

    await expect(repo.criar([a], [evento(a.id, 'criada')])).rejects.toThrow();

    expect(await repo.buscar(a.id)).toBeNull();
    const eventos = await db
      .select()
      .from(schema.eventosAuditoria)
      .where(eq(schema.eventosAuditoria.entidadeId, a.id));
    expect(eventos).toEqual([]);
  });

  it('lista com filtros, paginação, pendentes primeiro e recorte da gestora', async () => {
    const pendente = nova({ situacao: 'pendente', origem: 'medico', dataInicio: '2026-11-01' });
    const daBia = nova({ medicoId: ids.bia, dataInicio: '2026-10-20', dataFim: '2026-11-05' });
    const biaDepois = nova({ medicoId: ids.bia, dataInicio: '2026-12-01', dataFim: '2026-12-02' });
    const soTc = nova({ frenteIds: [ids.tc], dataInicio: '2026-12-15', dataFim: '2026-12-15' });
    const antiga = nova({ dataInicio: '2026-01-05', dataFim: '2026-01-06' });
    await repo.criar([pendente, daBia, biaDepois, soTc, antiga], []);
    const base = { de: '2026-10-01', pagina: 1, porPagina: 10, escopo: null };

    const todas = await repo.listar(base);
    expect(todas.total).toBe(4);
    expect(todas.itens.map((a) => a.id)).toEqual([pendente.id, soTc.id, biaDepois.id, daBia.id]);

    expect(
      (await repo.listar({ ...base, porPagina: 2, pagina: 2 })).itens.map((a) => a.id),
    ).toEqual([biaDepois.id, daBia.id]);
    expect((await repo.listar({ ...base, situacao: 'pendente' })).total).toBe(1);
    expect((await repo.listar({ ...base, medicoId: ids.bia })).total).toBe(2);
    expect((await repo.listar({ ...base, busca: 'lim' })).total).toBe(2);
    expect((await repo.listar({ ...base, tipoId: randomUUID() })).total).toBe(0);
    // Frente: as dessa frente e as de todas as frentes.
    expect((await repo.listar({ ...base, frenteId: ids.neuro })).total).toBe(3);
    expect((await repo.listar({ ...base, ate: '2026-11-30' })).total).toBe(2);

    const escopoTc = { turnoIds: new Set<string>(), frenteIds: new Set([ids.tc]) };
    // Bia tem TC só até outubro: vê a de outubro, não a de dezembro.
    const daGestora = await repo.listar({ ...base, escopo: escopoTc });
    expect(daGestora.itens.map((a) => a.id)).toEqual([daBia.id]);
    const escopoManha = { turnoIds: new Set([ids.manha]), frenteIds: new Set<string>() };
    expect((await repo.listar({ ...base, escopo: escopoManha })).total).toBe(2);
    expect(await repo.contarPendentes(null)).toBe(1);
    expect(await repo.contarPendentes(escopoManha)).toBe(1);
    expect(await repo.contarPendentes(escopoTc)).toBe(0);
  });

  it('as mais recentes do médico', async () => {
    const a = nova({ dataInicio: '2026-01-01', dataFim: '2026-01-01' });
    const b = nova({ dataInicio: '2026-03-01', dataFim: '2026-03-01' });
    const c = nova({ dataInicio: '2026-02-01', dataFim: '2026-02-01' });
    await repo.criar([a, b, c, nova({ medicoId: ids.bia })], []);

    expect((await repo.doMedico(ids.ana, 2)).map((x) => x.id)).toEqual([b.id, c.id]);
  });

  it('atualiza trocando frentes e turnos, revisa só a pendente e exclui', async () => {
    const a = nova({ situacao: 'pendente', frenteIds: [ids.neuro], turnoIds: [ids.manha] });
    await repo.criar([a], []);

    await repo.atualizar(
      a.id,
      { ...a, frenteIds: [ids.tc], turnoIds: [], dataFim: '2026-12-20', observacoes: 'x' },
      evento(a.id, 'alterada'),
    );
    expect(await repo.buscar(a.id)).toMatchObject({
      frentes: [{ id: ids.tc }],
      turnos: [],
      dataFim: '2026-12-20',
      observacoes: 'x',
    });

    const revisao = {
      situacao: 'recusada' as const,
      motivoRecusa: 'cheia',
      revisadaPorId: ids.gestor,
      revisadaEm: EM,
    };
    expect(await repo.revisar(a.id, revisao, evento(a.id, 'recusada'))).toBe(true);
    expect(await repo.revisar(a.id, revisao, evento(a.id, 'recusada'))).toBe(false);
    expect(await repo.buscar(a.id)).toMatchObject({
      situacao: 'recusada',
      motivoRecusa: 'cheia',
      revisadaPor: { id: ids.gestor, nome: 'Gestor' },
      revisadaEm: EM,
    });

    expect(await repo.excluir(a.id, evento(a.id, 'cancelada'), { somentePendente: true })).toBe(
      false,
    );
    expect(await repo.excluir(a.id, evento(a.id, 'excluida'))).toBe(true);
    expect(await repo.buscar(a.id)).toBeNull();
    expect(await repo.excluir(a.id, evento(a.id, 'excluida'))).toBe(false);

    const acoes = await db
      .select({ acao: schema.eventosAuditoria.acao })
      .from(schema.eventosAuditoria)
      .where(eq(schema.eventosAuditoria.entidadeId, a.id))
      .orderBy(schema.eventosAuditoria.acao);
    expect(acoes.map((e) => e.acao)).toEqual(['alterada', 'excluida', 'recusada']);
  });

  it('lê cadastros, alocações vigentes e o médico da conta', async () => {
    const outro = randomUUID();
    expect(await repo.tipo(ids.ferias)).toEqual({ id: ids.ferias, soGestor: true, ativo: false });
    expect(await repo.tipo(outro)).toBeNull();
    expect((await repo.medicosExistentes([ids.ana, outro])).sort()).toEqual([ids.ana]);
    expect(await repo.frentesExistentes([ids.tc, outro])).toEqual([ids.tc]);
    expect(await repo.turnosExistentes([outro])).toEqual([]);
    expect(await repo.medicosExistentes([])).toEqual([]);

    expect(await repo.alocacoesVigentes([ids.ana, ids.bia], '2026-12-01', '2026-12-31')).toEqual([
      { medicoId: ids.ana, turnoId: ids.manha, frenteId: ids.neuro },
    ]);
    expect(
      (await repo.alocacoesVigentes([ids.bia], '2026-10-31', '2026-12-31')).map((a) => a.frenteId),
    ).toEqual([ids.tc]);

    expect(await repo.medicoDoUsuario(ids.medicoUsuario)).toBe(ids.ana);
    expect(await repo.medicoDoUsuario(ids.gestor)).toBeNull();
    await db.delete(schema.usuarios).where(inArray(schema.usuarios.id, [ids.medicoUsuario]));
    expect(await repo.medicoDoUsuario(ids.medicoUsuario)).toBeNull();
  });
});
