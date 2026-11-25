import { resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { EventoAuditoria } from '../../auditoria/auditoria';
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
  let eNeuro: string;
  let eAbd: string;
  let mCt: string;
  let neuro: string;
  let tc: string;
  let medico: string;

  const turno = (extra: Partial<DadosTurno> = {}): DadosTurno => ({
    nome: 'Manhã',
    tipo: 'fixo',
    horarioInicio: '07:00',
    horarioFim: '13:00',
    especialidadeIds: [],
    modalidadeIds: [],
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
      vigencia: 'fixa',
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
      sql`truncate table eventos_auditoria, turnos, frentes_escala, especialidades, modalidades, medicos, usuarios, papeis, tipos_ausencia cascade`,
    );
    const [e, a] = await db
      .insert(schema.especialidades)
      .values([
        { nome: 'NEURO', ordem: 2 },
        { nome: 'ABDOME', ordem: 1 },
      ])
      .returning();
    const [m] = await db.insert(schema.modalidades).values({ codigo: 'CT', ordem: 0 }).returning();
    eNeuro = e?.id ?? '';
    eAbd = a?.id ?? '';
    mCt = m?.id ?? '';
    // A frente de NEURO já existe; a de CT nasce quando um turno a usa.
    const [frente] = await db
      .insert(schema.frentesEscala)
      .values({ tipo: 'especialidade', especialidadeId: eNeuro })
      .returning();
    neuro = frente?.id ?? '';
    tc = '';
    const [med] = await db
      .insert(schema.medicos)
      .values({ nome: 'Ana Reis', chaveNormalizada: 'ana reis' })
      .returning();
    medico = med?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  /** Cria o turno e devolve o id; guarda em `tc` o id da frente de CT, se ela entrou. */
  const criar = async (dados: DadosTurno) => {
    const { id, frenteIds } = await repo.criar(dados, () => []);
    const [frenteCt] = await db
      .select({ id: schema.frentesEscala.id })
      .from(schema.frentesEscala)
      .where(eq(schema.frentesEscala.modalidadeId, mCt));
    tc = frenteCt?.id ?? '';
    return { id, frenteIds };
  };

  it('grava o turno criando a frente que falta e reaproveitando a que existe', async () => {
    const { id, frenteIds } = await criar(
      turno({ especialidadeIds: [eNeuro], modalidadeIds: [mCt], cor: '#123456' }),
    );

    expect(frenteIds).toEqual([neuro, tc].sort());
    expect(await db.select().from(schema.frentesEscala)).toHaveLength(2);
    expect(await repo.buscar(id)).toEqual({
      id,
      nome: 'Manhã',
      tipo: 'fixo',
      horarioInicio: '07:00',
      horarioFim: '13:00',
      especialidadeIds: [eNeuro],
      modalidadeIds: [mCt],
      frentes: [
        {
          id: neuro,
          rotulo: 'NEURO',
          tipo: 'especialidade',
          especialidadeId: eNeuro,
          modalidadeId: null,
        },
        { id: tc, rotulo: 'CT', tipo: 'modalidade', especialidadeId: null, modalidadeId: mCt },
      ],
      descricao: null,
      cor: '#123456',
      ordem: 0,
      ativo: true,
    });
  });

  it('frentes do turno: especialidades e depois modalidades, pela ordem do catálogo', async () => {
    const { id } = await criar(turno({ especialidadeIds: [eNeuro, eAbd], modalidadeIds: [mCt] }));

    expect((await repo.buscar(id))?.frentes.map((f) => f.rotulo)).toEqual([
      'ABDOME',
      'NEURO',
      'CT',
    ]);
  });

  it('editar troca o conjunto de frentes e devolve os ids delas', async () => {
    const { id } = await criar(turno({ especialidadeIds: [eNeuro], modalidadeIds: [mCt] }));

    const { frenteIds } = await repo.atualizar(
      id,
      turno({ nome: 'Matutino', especialidadeIds: [eNeuro], modalidadeIds: [] }),
      () => [],
    );

    expect(frenteIds).toEqual([neuro]);
    expect(await repo.buscar(id)).toMatchObject({
      nome: 'Matutino',
      modalidadeIds: [],
      frentes: [{ id: neuro }],
    });
  });

  it('diz quais especialidades e modalidades existem no catálogo', async () => {
    const sumiu = '00000000-0000-4000-8000-000000000000';

    expect(await repo.noCatalogo({ especialidadeIds: [], modalidadeIds: [] })).toEqual({
      especialidadeIds: [],
      modalidadeIds: [],
    });
    expect(
      await repo.noCatalogo({
        especialidadeIds: [eNeuro, sumiu, mCt],
        modalidadeIds: [mCt, sumiu],
      }),
    ).toEqual({ especialidadeIds: [eNeuro], modalidadeIds: [mCt] });
  });

  it('lista por ordem e nome, com busca, ativo, paginação e turno sem frente', async () => {
    await criar(turno({ nome: 'Tarde', ordem: 1, modalidadeIds: [mCt] }));
    await criar(turno({ nome: 'Manhã', ordem: 1, descricao: 'Matutino' }));
    await criar(turno({ nome: 'Lista', tipo: 'lista', ordem: 0, ativo: false }));

    const pagina = await repo.listar({ pagina: 1, porPagina: 2 });
    expect(pagina.total).toBe(3);
    expect(pagina.itens.map((t) => [t.nome, t.frentes.length])).toEqual([
      ['Lista', 0],
      ['Manhã', 0],
    ]);
    expect((await repo.listar({ pagina: 2, porPagina: 2 })).itens[0]).toMatchObject({
      nome: 'Tarde',
      frentes: [{ id: tc, rotulo: 'CT' }],
    });
    expect((await repo.listar({ ativo: true, pagina: 1, porPagina: 10 })).total).toBe(2);
    expect(
      (await repo.listar({ busca: 'matu', pagina: 1, porPagina: 10 })).itens.map((t) => t.nome),
    ).toEqual(['Manhã']);
  });

  it('acha por nome sem diferenciar maiúsculas', async () => {
    const { id } = await criar(turno());

    expect(await repo.buscarPorNome('MANHÃ')).toEqual({ id });
  });

  it('alocações vigentes: sem fim ou com fim a partir de hoje, só do turno', async () => {
    const { id } = await criar(turno({ especialidadeIds: [eNeuro], modalidadeIds: [mCt] }));
    const { id: outro } = await criar(turno({ nome: 'Tarde', modalidadeIds: [mCt] }));
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
    const { id } = await criar(turno({ especialidadeIds: [eNeuro] }));

    expect(await repo.excluir(id, [])).toBe(true);
    expect(await repo.buscar(id)).toBeNull();
    expect(await db.select().from(schema.turnosFrentes)).toEqual([]);
  });

  it('excluir apaga a frente que ficou sem nenhuma referência e mantém a usada por outro turno', async () => {
    const { id } = await criar(turno({ especialidadeIds: [eNeuro], modalidadeIds: [mCt] }));
    await criar(turno({ nome: 'Tarde', especialidadeIds: [eNeuro] }));

    expect(await repo.excluir(id, [])).toBe(true);

    const restantes = await db.select({ id: schema.frentesEscala.id }).from(schema.frentesEscala);
    expect(restantes.map((f) => f.id)).toEqual([neuro]);
  });

  it('editar apaga a frente tirada do turno quando ninguém mais a usa', async () => {
    const { id } = await criar(turno({ especialidadeIds: [eNeuro], modalidadeIds: [mCt] }));

    await repo.atualizar(id, turno({ especialidadeIds: [eNeuro] }), () => []);

    const restantes = await db.select({ id: schema.frentesEscala.id }).from(schema.frentesEscala);
    expect(restantes.map((f) => f.id)).toEqual([neuro]);
  });

  it('editar mantém a frente tirada do turno que ainda tem alocação antiga', async () => {
    const { id } = await criar(turno({ especialidadeIds: [eNeuro], modalidadeIds: [mCt] }));
    await alocar(id, tc, { dataFim: '2026-02-01' });

    await repo.atualizar(id, turno({ especialidadeIds: [eNeuro] }), () => []);

    const restantes = await db.select({ id: schema.frentesEscala.id }).from(schema.frentesEscala);
    expect(restantes.map((f) => f.id).sort()).toEqual([neuro, tc].sort());
  });

  it('editar mantém a frente tirada do turno que está numa ausência ou no recorte de uma gestora', async () => {
    const { id } = await criar(turno({ especialidadeIds: [eNeuro], modalidadeIds: [mCt] }));
    const [usuario] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Carla Lima', email: 'carla@empresa.com.br' })
      .returning();
    await db
      .insert(schema.usuariosEscoposEscala)
      .values({ usuarioId: usuario?.id ?? '', frenteId: neuro });
    const [tipo] = await db.insert(schema.tiposAusencia).values({ nome: 'Férias' }).returning();
    const [ausencia] = await db
      .insert(schema.ausencias)
      .values({
        medicoId: medico,
        tipoId: tipo?.id ?? '',
        dataInicio: '2026-03-01',
        dataFim: '2026-03-05',
      })
      .returning();
    await db
      .insert(schema.ausenciasFrentes)
      .values({ ausenciaId: ausencia?.id ?? '', frenteId: tc });

    await repo.atualizar(id, turno(), () => []);

    const restantes = await db.select({ id: schema.frentesEscala.id }).from(schema.frentesEscala);
    expect(restantes.map((f) => f.id).sort()).toEqual([neuro, tc].sort());
  });

  it('não exclui turno com alocação (nem que já acabou)', async () => {
    const { id } = await criar(turno({ especialidadeIds: [eNeuro] }));
    await alocar(id, neuro, { dataFim: '2026-02-01' });

    expect(await repo.excluir(id, [])).toBe(false);
    expect(await repo.buscar(id)).not.toBeNull();
  });

  it('não exclui turno do recorte de uma gestora', async () => {
    const { id } = await criar(turno());
    const [usuario] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Carla Lima', email: 'carla@empresa.com.br' })
      .returning();
    await db
      .insert(schema.usuariosEscoposEscala)
      .values({ usuarioId: usuario?.id ?? '', turnoId: id });

    expect(await repo.excluir(id, [])).toBe(false);
    expect(await repo.buscar(id)).not.toBeNull();
  });

  describe('auditoria na mesma transação', () => {
    const evento = (entidadeId: string, acao: string): EventoAuditoria => ({
      ator: { tipo: 'sistema' },
      entidade: 'turno',
      entidadeId,
      acao,
      em: new Date('2026-11-16T12:00:00Z'),
    });
    const eventos = () =>
      db
        .select({
          entidadeId: schema.eventosAuditoria.entidadeId,
          acao: schema.eventosAuditoria.acao,
        })
        .from(schema.eventosAuditoria);

    it('cria, edita e exclui gravando o evento com o dado', async () => {
      const { id } = await repo.criar(
        turno({ especialidadeIds: [eNeuro] }),
        ({ id, frenteIds }) => {
          expect(frenteIds).toEqual([neuro]);
          return [evento(id, 'criado')];
        },
      );
      await repo.atualizar(id, turno({ nome: 'Matutino' }), ({ frenteIds }) => {
        expect(frenteIds).toEqual([]);
        return [evento(id, 'alterado')];
      });
      expect(await repo.excluir(id, [evento(id, 'excluido')])).toBe(true);

      expect((await eventos()).map((e) => [e.entidadeId, e.acao])).toEqual([
        [id, 'criado'],
        [id, 'alterado'],
        [id, 'excluido'],
      ]);
    });

    it('se o evento falha, o turno não é gravado', async () => {
      const falha = () => {
        throw new Error('falhou o evento');
      };
      await expect(repo.criar(turno(), falha)).rejects.toThrow('falhou o evento');
      expect(await db.select().from(schema.turnos)).toEqual([]);

      const { id } = await repo.criar(turno(), () => []);
      await expect(repo.atualizar(id, turno({ nome: 'Outro' }), falha)).rejects.toThrow();
      expect((await repo.buscar(id))?.nome).toBe('Manhã');
    });

    it('exclusão recusada não grava evento', async () => {
      const { id } = await repo.criar(turno({ especialidadeIds: [eNeuro] }), () => []);
      await alocar(id, neuro);

      expect(await repo.excluir(id, [evento(id, 'excluido')])).toBe(false);
      expect(await eventos()).toEqual([]);
    });
  });
});
