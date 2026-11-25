import { resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { DrizzleAlocacoesRepository } from '../alocacoes/drizzle-alocacoes.repository';
import { AcaoProibidaEscalaError } from '../domain';
import { DrizzleEscopoEscalaRepository } from '../escopo/drizzle-escopo.repository';
import { ConsultaOcorrenciasEscala } from '../ocorrencias/consulta-ocorrencias';
import { DrizzleCarregadorEscala } from '../ocorrencias/drizzle-carregador-escala';
import { DrizzleEscalaFixaRepository } from './drizzle-escala-fixa.repository';
import { EscalaFixaService } from './escala-fixa.service';

const url = process.env.TEST_DATABASE_URL;
const relogio = { now: () => new Date('2026-11-16T12:00:00Z') };
const A_PARTIR_DE = '2026-11-23';
const SEG = 1;
const TER = 2;
const QUA = 3;
const QUI = 4;
const SEX = 5;

describe.skipIf(!url)('repositório da escala fixa (banco)', () => {
  let pool: Pool;
  let db: Database;
  let ids: Record<string, string>;
  const id = (chave: string) => ids[chave] ?? '';

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table eventos_auditoria, ajustes_produtividade, alocacoes_prioridades,
        alocacoes_subespecialidades, alocacoes, turnos_frentes, turnos, frentes_escala,
        especialidades, prioridades_operacao, usuarios, papeis, medicos, usuarios_escopos_escala cascade`,
    );
    const [lista, manha] = await db
      .insert(schema.turnos)
      .values([
        { nome: 'Lista', tipo: 'lista', horarioInicio: '00:00', horarioFim: '00:00' },
        { nome: 'Manhã', horarioInicio: '07:00', horarioFim: '13:00' },
      ])
      .returning();
    const [esp] = await db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning();
    const [neuro] = await db
      .insert(schema.frentesEscala)
      .values({ tipo: 'especialidade', especialidadeId: esp?.id ?? '' })
      .returning();
    await db.insert(schema.turnosFrentes).values([
      { turnoId: lista?.id ?? '', frenteId: neuro?.id ?? '' },
      { turnoId: manha?.id ?? '', frenteId: neuro?.id ?? '' },
    ]);
    const [ana, bruno] = await db
      .insert(schema.medicos)
      .values([
        { nome: 'Ana Souza', chaveNormalizada: 'ana souza' },
        { nome: 'Bruno Lima', chaveNormalizada: 'bruno lima' },
      ])
      .returning();
    const [urgente] = await db
      .insert(schema.prioridadesOperacao)
      .values({ nome: 'URGENTE', posicao: 1, urgencia: 'sempre' })
      .returning();
    const [usuario, gestora] = await db
      .insert(schema.usuarios)
      .values([
        { nome: 'Gestor', email: 'gestor@x.com.br' },
        { nome: 'Gestora', email: 'gestora@x.com.br' },
      ])
      .returning();
    ids = {
      lista: lista?.id ?? '',
      manha: manha?.id ?? '',
      neuro: neuro?.id ?? '',
      ana: ana?.id ?? '',
      bruno: bruno?.id ?? '',
      urgente: urgente?.id ?? '',
      usuario: usuario?.id ?? '',
      gestora: gestora?.id ?? '',
    };
  });

  const montar = () => {
    const escopos = new DrizzleEscopoEscalaRepository(db);
    const consulta = new ConsultaOcorrenciasEscala(new DrizzleCarregadorEscala(db), relogio);
    return {
      escopos,
      service: new EscalaFixaService(
        new DrizzleEscalaFixaRepository(db),
        escopos,
        consulta,
        relogio,
      ),
    };
  };
  const admin = () => ({ usuarioId: id('usuario'), acessoTotal: true });
  const celula = (turno: string, diaSemana: number, produtividade: number | null) => ({
    turnoId: id(turno),
    diaSemana,
    produtividade,
  });
  const definir = (celulas: ReturnType<typeof celula>[], aPartirDe = A_PARTIR_DE) =>
    montar().service.definir(admin(), id('ana'), { frenteId: id('neuro'), aPartirDe, celulas });
  const daAna = () =>
    db
      .select()
      .from(schema.alocacoes)
      .where(eq(schema.alocacoes.medicoId, id('ana')))
      .orderBy(schema.alocacoes.dataInicio, schema.alocacoes.diasSemana);
  const exemplo = () => [
    celula('lista', SEG, 30),
    celula('lista', TER, 25),
    celula('lista', QUA, 40),
    celula('lista', QUI, 25),
    celula('lista', SEX, 30),
  ];

  it('cria do zero e lê de volta a mesma grade', async () => {
    expect(await definir(exemplo())).toEqual({
      criadas: 3,
      encerradas: 0,
      removidas: 0,
      mantidas: 0,
      avisos: [],
    });

    const linhas = await daAna();
    expect(linhas.map((a) => [a.diasSemana, a.produtividade, a.dataInicio, a.dataFim])).toEqual([
      [[SEG, SEX], 30, A_PARTIR_DE, null],
      [[TER, QUI], 25, A_PARTIR_DE, null],
      [[QUA], 40, A_PARTIR_DE, null],
    ]);
    expect(linhas[0]).toMatchObject({ horarioInicio: '00:00', horarioFim: '00:00' });
    const grade = await montar().service.obter(admin(), id('ana'), id('neuro'));
    expect(grade.foraDaGrade).toBe(0);
    expect(
      grade.celulas.toSorted((a, b) => a.diaSemana - b.diaSemana).map((c) => c.produtividade),
    ).toEqual([30, 25, 40, 25, 30]);
    const eventos = await db.select().from(schema.eventosAuditoria);
    expect(eventos.map((e) => [e.entidade, e.acao])).toEqual([
      ['alocacao', 'criado'],
      ['alocacao', 'criado'],
      ['alocacao', 'criado'],
    ]);
    expect(eventos[0]?.atorId).toBe(id('usuario'));
  });

  it('salvar igual não muda nada', async () => {
    await definir(exemplo());
    expect(await definir(exemplo(), '2026-12-01')).toMatchObject({
      criadas: 0,
      encerradas: 0,
      removidas: 0,
      mantidas: 3,
    });
  });

  it('mudar um dia e a produtividade: encerra o que começou antes, cria o novo', async () => {
    await definir(exemplo(), '2026-11-02');

    const resultado = await definir([
      celula('lista', SEG, 30),
      celula('lista', SEX, 30),
      celula('lista', TER, 25),
      celula('lista', QUA, 25),
      celula('lista', QUI, 50),
    ]);

    expect(resultado).toMatchObject({ criadas: 2, encerradas: 2, removidas: 0, mantidas: 1 });
    const linhas = await daAna();
    expect(linhas.map((a) => [a.diasSemana, a.produtividade, a.dataInicio, a.dataFim])).toEqual([
      [[SEG, SEX], 30, '2026-11-02', null],
      [[TER, QUI], 25, '2026-11-02', '2026-11-22'],
      [[QUA], 40, '2026-11-02', '2026-11-22'],
      [[TER, QUA], 25, A_PARTIR_DE, null],
      [[QUI], 50, A_PARTIR_DE, null],
    ]);
    const encerrados = await db
      .select()
      .from(schema.eventosAuditoria)
      .where(eq(schema.eventosAuditoria.acao, 'encerrado'));
    expect(encerrados).toHaveLength(2);
    expect(encerrados[0]?.depois).toMatchObject({
      dataFim: '2026-11-22',
      medicoId: id('ana'),
      turnoId: id('lista'),
      frenteId: id('neuro'),
    });
  });

  it('o que começa no "a partir de" ou depois é removido, com cobertura e ajuste', async () => {
    await definir([celula('lista', SEG, 30)], '2026-11-30');
    const [futura] = await daAna();
    const repoAlocacoes = new DrizzleAlocacoesRepository(db);
    await db.insert(schema.alocacoes).values({
      vigencia: 'periodo',
      medicoId: id('bruno'),
      turnoId: id('lista'),
      frenteId: id('neuro'),
      diasSemana: [SEG],
      horarioInicio: '00:00',
      horarioFim: '00:00',
      dataInicio: '2026-12-07',
      dataFim: '2026-12-07',
      coberturaDeId: futura?.id ?? '',
    });
    await db.insert(schema.ajustesProdutividade).values({
      alocacaoId: futura?.id ?? '',
      data: '2026-12-14',
      produtividade: 5,
    });

    expect(await definir([celula('lista', SEG, 35)])).toMatchObject({
      criadas: 1,
      removidas: 1,
      encerradas: 0,
    });

    expect(await repoAlocacoes.buscar(futura?.id ?? '')).toBeNull();
    expect(await db.select().from(schema.alocacoes)).toHaveLength(1);
    const excluidos = await db
      .select()
      .from(schema.eventosAuditoria)
      .where(eq(schema.eventosAuditoria.acao, 'excluido'));
    expect(excluidos.map((e) => e.entidade).sort()).toEqual([
      'ajuste_produtividade',
      'alocacao',
      'alocacao',
    ]);
  });

  it('alocação fora da grade fica intacta e é contada', async () => {
    const [comRecorte] = await db
      .insert(schema.alocacoes)
      .values({
        vigencia: 'fixa',
        medicoId: id('ana'),
        turnoId: id('manha'),
        frenteId: id('neuro'),
        diasSemana: [SEG],
        horarioInicio: '07:00',
        horarioFim: '13:00',
        dataInicio: '2026-01-05',
      })
      .returning();
    await db
      .insert(schema.alocacoesPrioridades)
      .values({ alocacaoId: comRecorte?.id ?? '', prioridadeId: id('urgente') });
    await db.insert(schema.alocacoes).values({
      vigencia: 'fixa',
      medicoId: id('ana'),
      turnoId: id('manha'),
      frenteId: id('neuro'),
      diasSemana: [TER],
      horarioInicio: '08:00',
      horarioFim: '12:00',
      dataInicio: '2026-01-05',
    });

    expect(await montar().service.obter(admin(), id('ana'), id('neuro'))).toMatchObject({
      celulas: [],
      foraDaGrade: 2,
    });
    expect(await definir([])).toMatchObject({ criadas: 0, encerradas: 0, removidas: 0 });
    expect((await daAna()).map((a) => a.dataFim)).toEqual([null, null]);
  });

  it('recorte: a gestora não vê nem mexe no turno de fora, e não escala nele', async () => {
    const { escopos, service } = montar();
    await escopos.definir(id('gestora'), {
      veTodaEscala: false,
      turnoIds: [id('manha')],
      frenteIds: [],
    });
    await definir([celula('lista', SEG, 30)], '2026-11-02');
    const gestora = { usuarioId: id('gestora'), acessoTotal: false };

    expect(await service.obter(gestora, id('ana'), id('neuro'))).toMatchObject({
      celulas: [],
      foraDaGrade: 0,
    });
    await service.definir(gestora, id('ana'), {
      frenteId: id('neuro'),
      aPartirDe: A_PARTIR_DE,
      celulas: [celula('manha', SEG, 10)],
    });
    await expect(
      service.definir(gestora, id('ana'), {
        frenteId: id('neuro'),
        aPartirDe: A_PARTIR_DE,
        celulas: [celula('lista', SEG, 10)],
      }),
    ).rejects.toBeInstanceOf(AcaoProibidaEscalaError);

    const linhas = await daAna();
    expect(linhas.map((a) => [a.turnoId, a.dataFim])).toEqual([
      [id('lista'), null],
      [id('manha'), null],
    ]);
  });
});
