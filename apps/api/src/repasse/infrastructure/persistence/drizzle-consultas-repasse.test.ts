import { resolve } from 'node:path';

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { DemonstrativoCalculado, GrupoCalculado } from '../../domain/demonstrativo';
import { DrizzleConsultasRepasse } from './drizzle-consultas-repasse';
import { DrizzleGeracoesRepasse } from './drizzle-geracoes-repasse';

const url = process.env.TEST_DATABASE_URL;

const TABELAS = sql`truncate table geracoes_repasse, recalculos_competencia, competencias, laudos,
  importacoes, adicionais_repasse, medicos, clientes, exames, modalidades, especialidades,
  categorias_exame, prioridades, contratados, usuarios cascade`;

describe.skipIf(!url)('DrizzleConsultasRepasse', () => {
  let pool: Pool;
  let db: Database;
  let consultas: DrizzleConsultasRepasse;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    consultas = new DrizzleConsultasRepasse(db);
  });

  afterAll(async () => {
    await db.execute(TABELAS);
    await pool.end();
  });

  const um = async <T extends { id: string }>(linhas: Promise<T[]>) => ((await linhas)[0] as T).id;

  beforeEach(async () => {
    await db.execute(TABELAS);
    ids.usuario = await um(
      db
        .insert(schema.usuarios)
        .values({ nome: 'Bruno Reis', email: 'bruno@exemplo.com.br' })
        .returning(),
    );
    ids.ana = await um(
      db
        .insert(schema.medicos)
        .values({ nome: 'Ána Souza', chaveNormalizada: 'ANA SOUZA' })
        .returning(),
    );
    ids.caio = await um(
      db
        .insert(schema.medicos)
        .values({ nome: 'Caio Lima', chaveNormalizada: 'CAIO LIMA' })
        .returning(),
    );
    ids.tc = await um(db.insert(schema.modalidades).values({ codigo: 'TC' }).returning());
    ids.neuro = await um(db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning());
    ids.colunas = await um(
      db.insert(schema.categoriasExame).values({ nome: 'COLUNAS' }).returning(),
    );
    ids.sc = await um(db.insert(schema.categoriasExame).values({ nome: 'SC' }).returning());
    ids.rotina = await um(db.insert(schema.prioridades).values({ nome: 'Rotina' }).returning());
    ids.cliente = await um(
      db.insert(schema.clientes).values({ nome: 'CEDIM', chaveNormalizada: 'CEDIM' }).returning(),
    );
    ids.unidade = await um(
      db
        .insert(schema.clientes)
        .values({ nome: 'CEDIM CENTRO', chaveNormalizada: 'CEDIM CENTRO' })
        .returning(),
    );
    ids.contratado = await um(
      db.insert(schema.contratados).values({ razaoSocial: 'Teleimagem Ltda' }).returning(),
    );
    ids.exame = await um(
      db
        .insert(schema.exames)
        .values({ nome: 'TC CRANIO', chaveNormalizada: 'TC CRANIO', modalidadeId: ids.tc })
        .returning(),
    );
    ids.peca = await um(
      db
        .insert(schema.exames)
        .values({ nome: 'TC COLUNA', chaveNormalizada: 'TC COLUNA', modalidadeId: ids.tc })
        .returning(),
    );
    const importacao = await um(
      db.insert(schema.importacoes).values({ origem: 'mobilemed' }).returning(),
    );
    const laudo = (
      n: number,
      dia: string,
      extra: Partial<typeof schema.laudos.$inferInsert> = {},
    ) => ({
      identidade: `consulta-${n}`,
      hashConteudo: 'h',
      importacaoId: importacao,
      origem: 'normal' as const,
      empresaOrigem: 'CEDIM',
      clienteId: ids.cliente,
      exameId: ids.exame,
      pacienteChave: 'p',
      estudo: 'TC',
      modalidadeOrigem: 'CT',
      prioridadeOrigem: 'Rotina',
      volume: 1,
      status: 'Assinado',
      dataRealizacao: new Date(`${dia}T12:00:00Z`),
      dataLaudo: new Date(`${dia}T13:00:00Z`),
      diaLaudo: dia,
      competencia: '2026-11',
      ...extra,
    });
    const [l1, l2, l3] = await db
      .insert(schema.laudos)
      .values([
        laudo(1, '2026-11-03'),
        laudo(2, '2026-11-01', { unidadeId: ids.unidade }),
        laudo(3, '2026-11-02'),
      ])
      .returning();
    ids.l1 = l1?.id ?? '';
    ids.l2 = l2?.id ?? '';
    ids.l3 = l3?.id ?? '';
    await db
      .insert(schema.laudosPecasQuebra)
      .values({ laudoId: ids.l2, ordem: 1, exameId: ids.peca });
    await db.insert(schema.competencias).values({
      competencia: '2026-11',
      status: 'fechada',
      fechadaEm: new Date('2026-12-05T12:00:00Z'),
      fechadaPorId: ids.usuario,
    });
    ids.recalculo = await um(
      db
        .insert(schema.recalculosCompetencia)
        .values({
          competencia: '2026-11',
          contexto: 'repasse',
          motivo: 'laudo da CEDIM com valor errado',
          solicitadoPorId: ids.usuario,
          solicitadoEm: new Date('2026-12-08T12:00:00Z'),
        })
        .returning(),
    );

    const arranjo = { modalidadeId: ids.tc, especialidadeId: ids.neuro, prioridadeId: ids.rotina };
    const grupo = (g: Partial<GrupoCalculado>): GrupoCalculado =>
      ({
        ...arranjo,
        categoriaId: ids.sc,
        clienteId: ids.cliente,
        unidadeId: null,
        precoId: null,
        categoriaPrecoId: null,
        ...g,
      }) as GrupoCalculado;
    const ana: DemonstrativoCalculado = {
      medicoId: ids.ana as string,
      contratadoId: ids.contratado as string,
      volume: 3,
      examesCentavos: 6414,
      adicionaisCentavos: -12000,
      brutoCentavos: -5586,
      retencoesCentavos: 0,
      liquidoCentavos: -5586,
      gruposSemPreco: 1,
      grupos: [
        grupo({
          volume: 2,
          unitarioCentavos: 3207,
          totalCentavos: 6414,
          origem: 'todos',
          laudos: [
            { laudoId: ids.l1 as string, peca: 0, volume: 1, totalCentavos: 3207 },
            { laudoId: ids.l3 as string, peca: 0, volume: 1, totalCentavos: 3207 },
          ],
        }),
        grupo({
          categoriaId: ids.colunas,
          unidadeId: ids.unidade,
          categoriaPrecoId: ids.sc,
          volume: 1,
          unitarioCentavos: 0,
          totalCentavos: 0,
          origem: 'sem_preco',
          laudos: [{ laudoId: ids.l2 as string, peca: 1, volume: 1, totalCentavos: 0 }],
        }),
      ],
      adicionais: [],
      extras: [],
      retencoes: [],
      dias: [
        { dia: '2026-11-03', volume: 1, totalCentavos: 3207 },
        { dia: '2026-11-01', volume: 1, totalCentavos: 0 },
      ],
    };
    const caio: DemonstrativoCalculado = {
      ...ana,
      medicoId: ids.caio as string,
      contratadoId: null,
      volume: 0,
      examesCentavos: 0,
      adicionaisCentavos: 50000,
      brutoCentavos: 50000,
      liquidoCentavos: 50000,
      gruposSemPreco: 0,
      grupos: [],
      dias: [],
    };
    const geracoes = new DrizzleGeracoesRepasse(db, async () => {});
    const base = { competencia: '2026-11', reabertaEm: null, geradoPorId: null };
    ids.g1 = await geracoes.gravar({
      ...base,
      tipo: 'previa',
      recalculoId: null,
      geradoEm: new Date('2026-11-30T12:00:00Z'),
      demonstrativos: [ana, caio],
    });
    ids.g2 = await geracoes.gravar({
      ...base,
      tipo: 'recalculo',
      recalculoId: ids.recalculo as string,
      geradoEm: new Date('2026-12-08T13:00:00Z'),
      demonstrativos: [ana],
    });
    // O adicional da Ana vira um item do demonstrativo (memória de cálculo).
    const [demo] = await db
      .select({ id: schema.demonstrativosRepasse.id })
      .from(schema.demonstrativosRepasse)
      .where(eq(schema.demonstrativosRepasse.geracaoId, ids.g2));
    ids.demo = demo?.id ?? '';
    await db.insert(schema.demonstrativosRepasseItens).values({
      demonstrativoId: ids.demo,
      tipo: 'adicional',
      totalCentavos: -12000,
      descricao: 'Desconto de equipamento',
    });
  });

  it('médicos para lançar: ativos, pela busca sem acento, limitados', async () => {
    await db
      .insert(schema.medicos)
      .values({ nome: 'Ana Inativa', chaveNormalizada: 'ANA INATIVA', ativo: false });
    expect(await consultas.medicos('ana', 10)).toEqual([{ id: ids.ana, nome: 'Ána Souza' }]);
    expect((await consultas.medicos(undefined, 1)).map((m) => m.nome)).toEqual(['Ána Souza']);
  });

  it('lista as competências com repasse gerado e a situação delas', async () => {
    expect(await consultas.competencias()).toEqual([{ competencia: '2026-11', status: 'fechada' }]);
  });

  it('competência: quem fechou, as gerações em ordem com os totais e o recálculo pendente', async () => {
    const c = await consultas.competencia('2026-11');
    expect(c).toMatchObject({
      status: 'fechada',
      fechadaPor: 'Bruno Reis',
      recalculoPendente: { motivo: 'laudo da CEDIM com valor errado', solicitadoPor: 'Bruno Reis' },
    });
    expect(c.geracoes.map((g) => [g.id, g.tipo, g.atual])).toEqual([
      [ids.g1, 'previa', false],
      [ids.g2, 'recalculo', true],
    ]);
    expect(c.geracoes[0]?.recalculo).toBeNull();
    expect(c.geracoes[1]?.recalculo?.motivo).toBe('laudo da CEDIM com valor errado');
    expect(c.geracoes[0]?.totais).toEqual({
      medicos: 2,
      volume: 3,
      examesCentavos: 6414,
      adicionaisCentavos: 38000,
      brutoCentavos: 44414,
      retencoesCentavos: 0,
      liquidoCentavos: 44414,
      gruposSemPreco: 1,
      laudosSemPreco: 1,
    });

    await db
      .update(schema.recalculosCompetencia)
      .set({ concluidoEm: new Date() })
      .where(eq(schema.recalculosCompetencia.id, ids.recalculo as string));
    expect((await consultas.competencia('2026-11')).recalculoPendente).toBeNull();
  });

  it('competência sem nada gravado: aberta e sem gerações', async () => {
    expect(await consultas.competencia('2027-03')).toMatchObject({
      status: 'aberta',
      fechadaPor: null,
      geracoes: [],
      recalculoPendente: null,
    });
  });

  it('demonstrativos: busca sem acento, situação, ordem, página e os totais do recorte', async () => {
    const f = {
      geracaoId: ids.g1 as string,
      situacao: 'todas' as const,
      ordem: 'liquido' as const,
      direcao: 'desc' as const,
      pagina: 1,
      porPagina: 1,
    };
    const todas = await consultas.demonstrativos(f);
    expect(todas.total).toBe(2);
    expect(todas.itens.map((x) => x.medico)).toEqual(['Caio Lima']);
    expect(todas.totais.liquidoCentavos).toBe(44414);
    expect((await consultas.demonstrativos({ ...f, pagina: 2 })).itens[0]?.medico).toBe(
      'Ána Souza',
    );

    const ana = await consultas.demonstrativos({ ...f, busca: 'ana', porPagina: 25 });
    expect(ana.itens.map((x) => x.medico)).toEqual(['Ána Souza']);
    expect(ana.totais).toMatchObject({ medicos: 1, gruposSemPreco: 1, laudosSemPreco: 1 });

    const semPreco = await consultas.demonstrativos({ ...f, situacao: 'sem_preco', porPagina: 25 });
    expect(semPreco.itens.map((x) => x.medico)).toEqual(['Ána Souza']);
    const comPreco = await consultas.demonstrativos({ ...f, situacao: 'com_preco', porPagina: 25 });
    expect(comPreco.itens.map((x) => x.medico)).toEqual(['Caio Lima']);
    expect(comPreco.totais.laudosSemPreco).toBe(0);
  });

  it('detalhe: grupos com os nomes e a origem do preço, lançamentos, dias e o contratado', async () => {
    const det = await consultas.demonstrativo(ids.demo as string);
    expect(det).toMatchObject({
      medico: 'Ána Souza',
      competencia: '2026-11',
      geracaoId: ids.g2,
      contratado: 'Teleimagem Ltda',
    });
    expect(det?.grupos).toEqual([
      expect.objectContaining({
        arranjo: {
          modalidadeId: ids.tc,
          especialidadeId: ids.neuro,
          categoriaId: ids.sc,
          prioridadeId: ids.rotina,
        },
        modalidade: 'TC',
        especialidade: 'NEURO',
        categoria: 'SC',
        prioridade: 'Rotina',
        cliente: 'CEDIM',
        unidade: null,
        volume: 2,
        unitarioCentavos: 3207,
        totalCentavos: 6414,
        origem: 'todos',
        categoriaPreco: null,
      }),
      expect.objectContaining({
        categoria: 'COLUNAS',
        unidade: 'CEDIM CENTRO',
        origem: 'sem_preco',
        categoriaPreco: 'SC',
      }),
    ]);
    expect(det?.lancamentos).toEqual([
      expect.objectContaining({
        tipo: 'adicional',
        descricao: 'Desconto de equipamento',
        totalCentavos: -12000,
      }),
    ]);
    expect(det?.dias.map((x) => x.dia)).toEqual(['2026-11-01', '2026-11-03']);
    expect(await consultas.demonstrativo('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('laudos: paginados por data, com o exame da peça e a unidade', async () => {
    const p1 = await consultas.laudos(ids.demo as string, 1, 2);
    expect(p1.total).toBe(3);
    expect(p1.itens).toEqual([
      expect.objectContaining({
        laudoId: ids.l2,
        peca: 1,
        exame: 'TC COLUNA',
        cliente: 'CEDIM CENTRO',
        totalCentavos: 0,
      }),
      expect.objectContaining({ laudoId: ids.l3, exame: 'TC CRANIO', cliente: 'CEDIM' }),
    ]);
    expect((await consultas.laudos(ids.demo as string, 2, 2)).itens.map((l) => l.laudoId)).toEqual([
      ids.l1,
    ]);
  });
});
