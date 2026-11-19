import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { RodadaVivaError } from '../../application/use-cases/rodadas/erros';
import { RECORTES_VAZIOS } from '../../domain/rodada/entrada';
import type { DesignacaoNova } from '../../domain/rodada/proposta';
import { DrizzleRodadasRepository } from './drizzle-rodadas.repository';

const url = process.env.TEST_DATABASE_URL;
const agora = new Date('2026-11-18T12:00:00Z');
const minutos = (n: number) => new Date(agora.getTime() + n * 60_000);

describe.skipIf(!url)('repositório Drizzle das rodadas', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleRodadasRepository;
  let usuarioId: string;
  let medicoId: string;

  const jobs = async () =>
    (
      await db.execute<{ task_identifier: string; key: string | null; queue_name: string | null }>(
        sql`select task_identifier, key, queue_name from graphile_worker.jobs order by id`,
      )
    ).rows;

  const designacao = (idExame: string, p: Partial<DesignacaoNova> = {}): DesignacaoNova => ({
    idExame,
    ordem: 0,
    pacienteChave: `hmac-${idExame}`,
    estudo: 'TC TORAX',
    unidade: 'HOSPITAL A',
    laudos: 1,
    realizadoEm: agora,
    entradaEm: agora,
    prazo: minutos(600),
    prioridadeGrafia: 'Rotina',
    prioridadeId: null,
    prioridadeOperacaoId: null,
    posicao: 3,
    urgente: false,
    clienteId: null,
    exameId: null,
    especialidadeId: null,
    modalidadeId: null,
    subespecialidadeId: null,
    especialidadesDoSegmento: [],
    medicoPropostoId: medicoId,
    medicoId,
    agrupadoCom: null,
    gratificado: false,
    alocacaoGratificadaId: null,
    coberturaDeId: null,
    status: 'prevista',
    motivo: null,
    detalhe: null,
    elegiveis: [],
    barrados: {},
    naMao: false,
    recolhidoDeId: null,
    motivoRecolhimento: null,
    ...p,
  });

  const criarComProposta = async (lista: DesignacaoNova[]) => {
    const id = await repo.criar({
      solicitadaPorId: usuarioId,
      recortes: RECORTES_VAZIOS,
      evento: 'Rodada pedida.',
      agora,
    });
    await repo.mudar(id, ['solicitada'], { status: 'lendo' });
    await repo.gravarProposta(id, {
      designacoes: lista,
      avisos: ['aviso'],
      lidos: lista.length,
      recolhidos: lista.filter((d) => d.recolhidoDeId).length,
      urgentes: 0,
      insumos: {
        leituraEm: agora.toISOString(),
        funil: {} as never,
        trilha: [] as never,
        grafiasSemDePara: [],
        habilitados: [medicoId],
        medicos: [],
      },
      lidaEm: agora,
      expiraEm: minutos(45),
    });
    return id;
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    await runMigrations({ pgPool: pool });
    repo = new DrizzleRodadasRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table rodadas cascade`);
    await db.execute(sql`delete from graphile_worker._private_jobs`);
    const [usuario] = await db
      .insert(schema.usuarios)
      .values({
        nome: 'Maria Operação',
        email: `m${Math.random()}@t.com`,
      })
      .returning();
    usuarioId = usuario?.id ?? '';
    const [medico] = await db
      .insert(schema.medicos)
      .values({ nome: 'Dra. Ana', chaveNormalizada: `ana ${Math.random()}`, idMobilemed: null })
      .returning();
    medicoId = medico?.id ?? '';
  });

  it('cria a rodada com o evento e enfileira a leitura na fila da distribuição', async () => {
    const id = await repo.criar({
      solicitadaPorId: usuarioId,
      recortes: { ...RECORTES_VAZIOS, turnoIds: [medicoId] },
      evento: 'Rodada pedida.',
      agora,
    });
    expect(await repo.obter(id)).toMatchObject({
      status: 'solicitada',
      solicitadaPorId: usuarioId,
      recortes: { turnoIds: [medicoId] },
    });
    expect(await repo.eventos(id, 10)).toMatchObject([{ texto: 'Rodada pedida.' }]);
    expect(await jobs()).toEqual([
      {
        task_identifier: 'distribuicao.ler-fila',
        key: `rodada:${id}:ler`,
        queue_name: 'distribuicao',
      },
    ]);
  });

  it('o banco garante uma rodada viva por vez', async () => {
    await repo.criar({ solicitadaPorId: usuarioId, recortes: RECORTES_VAZIOS, evento: 'a', agora });
    await expect(
      repo.criar({ solicitadaPorId: usuarioId, recortes: RECORTES_VAZIOS, evento: 'b', agora }),
    ).rejects.toBeInstanceOf(RodadaVivaError);
    expect(await jobs()).toHaveLength(1);
  });

  it('muda o status só a partir do esperado e enfileira na mesma transação', async () => {
    const id = await criarComProposta([designacao('e1')]);
    expect(await repo.mudar(id, ['aprovada'], { status: 'executando' })).toBe(false);
    expect(
      await repo.mudar(
        id,
        ['aguardando_aprovacao'],
        { status: 'aprovada', aprovadaPorId: usuarioId, aprovadaEm: agora },
        'executar',
      ),
    ).toBe(true);
    expect((await repo.obter(id))?.status).toBe('aprovada');
    expect((await jobs()).map((j) => j.task_identifier)).toContain('distribuicao.executar-rodada');
  });

  it('expira a proposta vencida', async () => {
    const id = await criarComProposta([designacao('e1')]);
    expect(await repo.expirarVencidas(minutos(30))).toBe(0);
    expect(await repo.expirarVencidas(minutos(60))).toBe(1);
    expect((await repo.obter(id))?.status).toBe('expirada');
    expect(await repo.viva()).toBeNull();
  });

  it('grava a proposta e conta por status; resultado, pulo e reenfileiramento só na prevista', async () => {
    const id = await criarComProposta([
      designacao('e1', { ordem: 0 }),
      designacao('e2', { ordem: 1 }),
      designacao('e3', { ordem: 2, status: 'recusada', medicoId: null, motivo: 'sem_medico' }),
    ]);
    expect(await repo.contar(id)).toMatchObject({ prevista: 2, recusada: 1 });
    const [p1, p2] = await repo.previstas(id);
    await repo.registrarResultado(
      p1?.id ?? '',
      { status: 'falhou', motivo: 'sessao_caiu', detalhe: 'x', retentavel: true },
      agora,
    );
    expect(
      await repo.registrarResultado(
        p1?.id ?? '',
        { status: 'executada', motivo: null, detalhe: null, retentavel: false },
        agora,
      ),
    ).toBe(false);
    expect(await repo.contar(id)).toMatchObject({ prevista: 1, falhou: 1, retentaveis: 1 });
    expect(await repo.reenfileirarRetentaveis(id)).toBe(1);
    expect(await repo.pularPrevistas(id, 'encerrada', 'x')).toBe(2);
    expect(await repo.contar(id)).toMatchObject({ prevista: 0, pulada: 2, retentaveis: 0 });
    expect(p2).toBeDefined();
  });

  it('tira e move na proposta', async () => {
    const id = await criarComProposta([designacao('e1'), designacao('e2', { ordem: 1 })]);
    const [a, b] = await repo.previstas(id);
    const [outro] = await db
      .insert(schema.medicos)
      .values({ nome: 'Dr. Beto', chaveNormalizada: `beto ${Math.random()}` })
      .returning();
    expect(await repo.removerDaProposta(id, [a?.id ?? ''], minutos(2))).toBe(1);
    expect(
      await repo.moverNaProposta(id, [
        { designacaoId: b?.id ?? '', medicoId: outro?.id ?? '', naMao: false },
      ]),
    ).toBe(1);
    const lidas = await repo.designacoesPorId(id, [a?.id ?? '', b?.id ?? '']);
    expect(lidas.find((d) => d.id === a?.id)).toMatchObject({
      status: 'pulada',
      medicoId: null,
      retiradoDeId: medicoId,
    });
    expect(lidas.find((d) => d.id === b?.id)?.medicoId).toBe(outro?.id);
    expect(await repo.ajustes(id)).toEqual({ tirados: 1, movidos: 1, naMao: 0 });

    // O tirado não volta a quem saiu (como o já entregue); desfazer devolve e libera.
    expect((await repo.entregues(['e1'], agora)).get('e1')).toEqual([
      { medicoId, em: minutos(2), origem: 'conferencia' },
    ]);
    expect(await repo.restaurarNaProposta(id, [a?.id ?? ''])).toBe(1);
    expect((await repo.designacoesPorId(id, [a?.id ?? '']))[0]).toMatchObject({
      status: 'prevista',
      medicoId,
      retiradoDeId: null,
    });
    expect(await repo.entregues(['e1'], agora)).toEqual(new Map());
  });

  it('manda na mão a recusada, com o pacote do paciente e as contagens por médico e motivo', async () => {
    const id = await criarComProposta([
      designacao('p1', { pacienteChave: 'pac', urgente: true }),
      designacao('p2', { ordem: 1, pacienteChave: 'pac' }),
      designacao('r1', {
        ordem: 2,
        status: 'recusada',
        medicoId: null,
        medicoPropostoId: null,
        motivo: 'sem_espaco',
        elegiveis: [medicoId],
        barrados: { x: 'arranjo' },
      }),
    ]);
    const [r1] = (await repo.designacoes(id, { pagina: 1, porPagina: 10, status: ['recusada'] }))
      .itens;
    const p1 = (await repo.previstas(id))[0];
    expect((await repo.doMesmoPaciente(id, p1?.id ?? '')).map((d) => d.idExameMobilemed)).toEqual([
      'p2',
    ]);
    expect(await repo.porMotivo(id)).toEqual([
      { status: 'recusada', motivo: 'sem_espaco', quantidade: 1 },
    ]);
    expect(
      await repo.moverNaProposta(id, [{ designacaoId: r1?.id ?? '', medicoId, naMao: true }]),
    ).toBe(1);
    const lista = await repo.designacoes(id, { pagina: 1, porPagina: 10, naMao: true });
    expect(lista.itens).toEqual([
      expect.objectContaining({ idExameMobilemed: 'r1', status: 'prevista', naMao: true }),
    ]);
    const pacote = (await repo.designacoes(id, { pagina: 1, porPagina: 10 })).itens[0]?.pacote;
    expect(pacote).toEqual({ id: expect.any(String), exames: 2 });
    expect(await repo.porMedico(id)).toEqual([
      expect.objectContaining({
        medicoId,
        nome: 'Dra. Ana',
        propostos: 3,
        urgencias: 1,
        pacotes: 1,
        previstas: 3,
        naMao: 1,
      }),
    ]);
    const explicada = await repo.designacaoExplicada(id, r1?.id ?? '');
    expect(explicada).toMatchObject({ elegiveis: [medicoId], barrados: { x: 'arranjo' } });
  });

  it('a retomada soma na rodada; os insumos voltam como gravados', async () => {
    const id = await criarComProposta([designacao('e1')]);
    await repo.mudar(id, ['aguardando_aprovacao'], { status: 'pausada', retomada: true });
    expect((await repo.obter(id))?.retomadas).toBe(1);
    expect((await repo.insumos(id))?.habilitados).toEqual([medicoId]);
  });

  it('o evento de progresso substitui o anterior em vez de empilhar', async () => {
    const id = await criarComProposta([]);
    await repo.registrarEvento(id, 'Atribuindo: 1 de 3.', minutos(1), { atual: 1, total: 3 });
    await repo.registrarEvento(id, 'Atribuindo: 2 de 3.', minutos(2), { atual: 2, total: 3 });
    const eventos = await repo.eventos(id, 10);
    expect(eventos.map((e) => e.texto)).toEqual(['Rodada pedida.', 'Atribuindo: 2 de 3.']);
    expect(eventos.at(-1)).toMatchObject({ atual: 2, total: 3 });
  });

  it('já entregue e cota gratificada saem das executadas', async () => {
    const id = await criarComProposta([designacao('e1'), designacao('e2', { ordem: 1 })]);
    const [p1] = await repo.previstas(id);
    await repo.registrarResultado(
      p1?.id ?? '',
      { status: 'executada', motivo: null, detalhe: null, retentavel: false },
      minutos(5),
    );
    const entregues = await repo.entregues(['e1', 'e2'], agora);
    expect(entregues.get('e1')).toEqual([{ medicoId, em: minutos(5), origem: 'execucao' }]);
    expect(entregues.has('e2')).toBe(false);
    expect(await repo.entregues(['e1'], minutos(10))).toEqual(new Map());
    expect(await repo.cotaEntregue([])).toEqual({});
  });

  it('recolhido: marca de quem sai, bloqueia a volta a ele e a última entrega é do novo dono', async () => {
    const [outro] = await db
      .insert(schema.medicos)
      .values({ nome: 'Dr. Bruno', chaveNormalizada: `bruno ${Math.random()}`, idMobilemed: 7 })
      .returning();
    const deId = outro?.id ?? '';
    const id = await criarComProposta([
      designacao('e1', { recolhidoDeId: deId, motivoRecolhimento: 'turno_encerrado' }),
      designacao('e2', { ordem: 1 }),
    ]);
    expect((await repo.obter(id))?.recolhidos).toBe(1);
    const [p1] = await repo.previstas(id);
    expect(p1?.recolhidoDeId).toBe(deId);
    await repo.registrarResultado(
      p1?.id ?? '',
      { status: 'executada', motivo: null, detalhe: null, retentavel: false },
      minutos(5),
    );
    expect((await repo.entregues(['e1'], agora)).get('e1')).toEqual([
      { medicoId, em: minutos(5), origem: 'execucao' },
      { medicoId: deId, em: minutos(5), origem: 'recolhimento' },
    ]);
    expect(await repo.ultimasEntregas(['e1', 'e2'])).toEqual(
      new Map([['e1', { medicoId, em: minutos(5) }]]),
    );
    const so = await repo.designacoes(id, { recolhido: true, pagina: 1, porPagina: 10 });
    expect(so.itens.map((d) => [d.idExameMobilemed, d.recolhidoDe, d.motivoRecolhimento])).toEqual([
      ['e1', { id: deId, nome: 'Dr. Bruno' }, 'turno_encerrado'],
    ]);
    const fora = await repo.designacoes(id, { recolhido: false, pagina: 1, porPagina: 10 });
    expect(fora.itens.map((d) => d.idExameMobilemed)).toEqual(['e2']);
    const h = await repo.historico({ pagina: 1, porPagina: 10 });
    expect(h.itens[0]?.recolhidos).toBe(1);
  });

  it('reiniciar a leitura apaga as designações e volta a solicitada com a leitura enfileirada', async () => {
    const id = await criarComProposta([designacao('e1')]);
    await db.execute(sql`delete from graphile_worker._private_jobs`);
    expect(
      await repo.reiniciarLeitura(id, ['aguardando_aprovacao'], {
        ...RECORTES_VAZIOS,
        medicosExcluidos: [medicoId],
      }),
    ).toBe(true);
    expect(await repo.obter(id)).toMatchObject({
      status: 'solicitada',
      recortes: { medicosExcluidos: [medicoId] },
    });
    expect(await repo.contar(id)).toMatchObject({ prevista: 0 });
    expect((await jobs()).map((j) => j.task_identifier)).toEqual(['distribuicao.ler-fila']);
  });

  it('consulta: designações com os nomes, filtros e paginação; histórico com quem pediu', async () => {
    const id = await criarComProposta([
      designacao('e1', { ordem: 0, estudo: 'RM CRANIO' }),
      designacao('e2', { ordem: 1 }),
      designacao('e3', { ordem: 2, status: 'recusada', medicoId: null }),
    ]);
    const pagina = await repo.designacoes(id, { pagina: 1, porPagina: 2 });
    expect(pagina.total).toBe(3);
    expect(pagina.itens.map((d) => d.idExameMobilemed)).toEqual(['e1', 'e2']);
    expect(pagina.itens[0]?.medico).toEqual({ id: medicoId, nome: 'Dra. Ana' });
    expect(
      (await repo.designacoes(id, { pagina: 1, porPagina: 10, status: ['recusada'] })).total,
    ).toBe(1);
    expect(
      (await repo.designacoes(id, { pagina: 1, porPagina: 10, busca: 'cranio' })).itens.map(
        (d) => d.idExameMobilemed,
      ),
    ).toEqual(['e1']);
    const historico = await repo.historico({ pagina: 1, porPagina: 10 });
    expect(historico.itens[0]).toMatchObject({
      id,
      solicitadaPor: { id: usuarioId, nome: 'Maria Operação' },
      lidos: 3,
      propostos: 3,
      executadas: 0,
      deFora: 1,
    });
    expect(
      (await repo.historico({ pagina: 1, porPagina: 10, status: ['concluida'] })).itens.some(
        (r) => r.id === id,
      ),
    ).toBe(false);
    expect((await repo.nomesUsuarios([usuarioId])).get(usuarioId)).toBe('Maria Operação');
  });
});
