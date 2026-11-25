import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from 'graphile-worker';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { Tipificacao } from '../../../faturamento/domain/tipificacao';
import type { JanelaLaudos } from '../../application/ports/laudos.repository';
import type { LaudoPreparado } from '../../domain/preparar-laudo';
import { DrizzleLaudosRepository } from './drizzle-laudos.repository';
import { DrizzleLinhasBrutasRepository } from './drizzle-linhas-brutas.repository';
import { DrizzlePacientesLaudos } from './drizzle-pacientes-laudos';

const url = process.env.TEST_DATABASE_URL;
const agora = new Date('2026-10-07T12:00:00Z');

const laudo = (identidade: string, campos: Partial<LaudoPreparado> = {}): LaudoPreparado => ({
  identidade,
  hashConteudo: `h-${identidade}`,
  origem: 'normal',
  empresaOrigem: 'CLINICA X',
  clienteId: null,
  unidadeId: null,
  accessionNumber: 'A1',
  pacienteChave: 'p',
  estudo: 'TC TORAX',
  exameId: null,
  modalidadeOrigem: 'CT',
  modalidadeId: null,
  especialidadeOrigem: null,
  especialidadeId: null,
  categoriaId: null,
  prioridadeOrigem: 'Rotina',
  prioridadeId: null,
  medicoOrigem: null,
  medicoId: null,
  medicoReassinaturaOrigem: null,
  medicoReassinaturaId: null,
  medicoIdMobilemed: null,
  medicoReassinaturaIdMobilemed: null,
  valores: 1,
  volume: 1,
  status: 'Assinado',
  duplicado: false,
  complementar: false,
  dataRealizacao: new Date('2026-10-05T11:00:00Z'),
  dataTransferencia: null,
  dataLaudo: new Date('2026-10-06T13:00:00Z'),
  dataPrazo: new Date('2026-10-06T12:00:00Z'),
  dataReassinatura: null,
  diaLaudo: '2026-10-06',
  competencia: '2026-10',
  pecas: [],
  paciente: null,
  ...campos,
});

const janela: JanelaLaudos = {
  origem: 'normal',
  inicio: '2026-10-06',
  fim: '2026-10-06',
  competenciasBloqueadas: [],
};

describe.skipIf(!url)('DrizzleLaudosRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleLaudosRepository;
  let importacaoId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    await runMigrations({ pgPool: pool });
    repo = new DrizzleLaudosRepository(db);
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table laudos, totais_laudos_dia, importacoes, arquivos, medicos, regras_tipificacao, subregras_tipificacao cascade`,
    );
    const [arquivo] = await db
      .insert(schema.arquivos)
      .values({ chave: 'a.xlsx', nomeOriginal: 'a.xlsx', tipoConteudo: 'x', contexto: 'ingestao' })
      .returning();
    const [importacao] = await db
      .insert(schema.importacoes)
      .values({ arquivoId: arquivo?.id ?? '', origem: 'upload_manual' })
      .returning();
    importacaoId = importacao?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  const vazio = {
    inserir: [],
    atualizar: [],
    remover: [],
    linhasBrutas: new Map(),
    pacientes: new Map(),
    idsMedico: new Map(),
    classificacoes: new Map(),
  };

  it('grava os novos com a linha crua e devolve-os na janela', async () => {
    await repo.aplicar(
      importacaoId,
      janela,
      { ...vazio, inserir: [laudo('a')], linhasBrutas: new Map([['a', { EMPRESA: 'CLINICA X' }]]) },
      agora,
    );

    expect(await repo.existentesNaJanela(janela)).toEqual(
      new Map([
        [
          'a',
          {
            hashConteudo: 'h-a',
            removido: false,
            competencia: '2026-10',
            pacienteConferencia: null,
            medicoIdMobilemed: null,
            medicoReassinaturaIdMobilemed: null,
          },
        ],
      ]),
    );
    const brutas = await db.select().from(schema.laudosLinhasBrutas);
    expect(brutas.map((b) => b.dados)).toEqual([{ EMPRESA: 'CLINICA X' }]);
  });

  it('grava o paciente à parte, também de laudo sem outra mudança, e o regrava quando muda', async () => {
    await repo.aplicar(
      importacaoId,
      janela,
      { ...vazio, inserir: [laudo('a'), laudo('b')] },
      agora,
    );
    const paciente = (nome: string, conferencia: string) => ({ nome, codigo: '007', conferencia });

    // Os dois já existiam sem paciente e não mudaram: só o paciente é gravado.
    await repo.aplicar(
      importacaoId,
      janela,
      {
        ...vazio,
        pacientes: new Map([
          ['a', paciente('Fulano', 'p1')],
          ['b', paciente('Beltrano', 'p2')],
          ['nao-existe', paciente('Ninguém', 'p3')],
        ]),
      },
      agora,
    );
    const existentes = await repo.existentesNaJanela(janela);
    expect(existentes.get('a')?.pacienteConferencia).toBe('p1');
    expect(existentes.get('b')?.pacienteConferencia).toBe('p2');

    await repo.aplicar(
      importacaoId,
      janela,
      { ...vazio, pacientes: new Map([['a', paciente('Fulano Corrigido', 'p4')]]) },
      agora,
    );
    const gravados = await db
      .select({ nome: schema.laudosPacientes.nome, codigo: schema.laudosPacientes.codigo })
      .from(schema.laudosPacientes)
      .orderBy(schema.laudosPacientes.nome);
    expect(gravados).toEqual([
      { nome: 'Beltrano', codigo: '007' },
      { nome: 'Fulano Corrigido', codigo: '007' },
    ]);

    // A leitura por id do laudo (a porta do caso de uso auditado).
    const [a] = await db
      .select({ id: schema.laudos.id })
      .from(schema.laudos)
      .where(sql`${schema.laudos.identidade} = 'a'`);
    const lidos = await new DrizzlePacientesLaudos(db).porLaudos([
      a?.id ?? '',
      '00000000-0000-0000-0000-000000000000',
    ]);
    expect(lidos).toEqual(new Map([[a?.id, { nome: 'Fulano Corrigido', codigo: '007' }]]));
  });

  it('grava o id da conta MobileMed em laudo sem outra mudança; nulo mantém o gravado', async () => {
    await repo.aplicar(
      importacaoId,
      janela,
      { ...vazio, inserir: [laudo('a'), laudo('b')] },
      agora,
    );
    const ids = async (identidade: string) => {
      const e = (await repo.existentesNaJanela(janela)).get(identidade);
      return [e?.medicoIdMobilemed, e?.medicoReassinaturaIdMobilemed];
    };

    await repo.aplicar(
      importacaoId,
      janela,
      {
        ...vazio,
        idsMedico: new Map([
          ['a', { medicoIdMobilemed: 45, medicoReassinaturaIdMobilemed: null }],
          ['nao-existe', { medicoIdMobilemed: 1, medicoReassinaturaIdMobilemed: 2 }],
        ]),
      },
      agora,
    );
    expect(await ids('a')).toEqual([45, null]);
    expect(await ids('b')).toEqual([null, null]);

    await repo.aplicar(
      importacaoId,
      janela,
      {
        ...vazio,
        idsMedico: new Map([['a', { medicoIdMobilemed: null, medicoReassinaturaIdMobilemed: 46 }]]),
      },
      agora,
    );
    expect(await ids('a')).toEqual([45, 46]);
    // O laudo não muda de hash nem ganha linha crua.
    expect((await repo.existentesNaJanela(janela)).get('a')?.hashConteudo).toBe('h-a');
    expect(await db.select().from(schema.laudosLinhasBrutas)).toEqual([]);
  });

  it('grava a tipificação dos laudos da janela, só a que mudou, e nunca na competência bloqueada', async () => {
    const [co, nc] = await db
      .insert(schema.regrasTipificacao)
      .values([{ nome: 'CO', padrao: true }, { nome: 'NC' }])
      .returning();
    const [ncnf] = await db
      .insert(schema.subregrasTipificacao)
      .values({ regraId: nc?.id ?? '', nome: 'NC-NF' })
      .returning();
    const CO: Tipificacao = { regraId: co?.id ?? '', subregraId: null, fatura: true };
    const NCNF = { regraId: nc?.id ?? '', subregraId: ncnf?.id ?? '', fatura: false };
    await repo.aplicar(
      importacaoId,
      janela,
      {
        ...vazio,
        inserir: [laudo('a'), laudo('b', { competencia: '2026-09' })],
        classificacoes: new Map([
          ['a', { ...CO, competencia: '2026-10' }],
          ['b', { ...CO, competencia: '2026-09' }],
        ]),
      },
      agora,
    );
    const ler = async () =>
      (
        await db.execute<{ identidade: string; fatura: boolean; calculado_em: string }>(sql`
          select l.identidade, c.fatura, c.calculado_em from classificacoes_laudo c
          join laudos l on l.id = c.laudo_id order by l.identidade`)
      ).rows;
    expect((await ler()).map((r) => [r.identidade, r.fatura])).toEqual([
      ['a', true],
      ['b', true],
    ]);

    // Depois: "b" mudou; "a" igual não é regravada; a de 2026-09 (agora fechada) não muda.
    const depois = new Date('2026-10-08T12:00:00Z');
    await repo.aplicar(
      importacaoId,
      { ...janela, competenciasBloqueadas: ['2026-09'] },
      {
        ...vazio,
        classificacoes: new Map([
          ['a', { ...CO, competencia: '2026-10' }],
          ['b', { ...NCNF, competencia: '2026-09' }],
        ]),
      },
      depois,
    );
    const linhas = await ler();
    expect(
      linhas.map((r) => [r.identidade, r.fatura, new Date(r.calculado_em).toISOString()]),
    ).toEqual([
      ['a', true, agora.toISOString()],
      ['b', true, agora.toISOString()],
    ]);
    await repo.aplicar(
      importacaoId,
      janela,
      { ...vazio, classificacoes: new Map([['b', { ...NCNF, competencia: '2026-09' }]]) },
      depois,
    );
    // A linha nova levaria "a" para outra competência e a gravação a pulou: a tipificação também.
    await repo.aplicar(
      importacaoId,
      janela,
      { ...vazio, classificacoes: new Map([['a', { ...NCNF, competencia: '2026-11' }]]) },
      depois,
    );
    expect((await ler()).map((r) => [r.identidade, r.fatura])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('a janela filtra origem, dias e empresas, e traz também os de competência bloqueada', async () => {
    await repo.aplicar(
      importacaoId,
      janela,
      {
        ...vazio,
        inserir: [
          laudo('a'),
          laudo('b', { origem: 'compartilhamento' }),
          laudo('c', { diaLaudo: '2026-10-07' }),
          laudo('d', { empresaOrigem: 'OUTRA' }),
          laudo('e', { competencia: '2026-09' }),
        ],
      },
      agora,
    );

    const chaves = async (j: Partial<JanelaLaudos>) =>
      [...(await repo.existentesNaJanela({ ...janela, ...j })).keys()].sort();
    expect(await chaves({})).toEqual(['a', 'd', 'e']);
    expect(await chaves({ empresas: ['CLINICA X'] })).toEqual(['a', 'e']);
    // A importação decide o que fazer com eles pela competência gravada (não os remove).
    expect(await chaves({ competenciasBloqueadas: ['2026-09'] })).toEqual(['a', 'd', 'e']);
    expect((await repo.existentesNaJanela(janela)).get('e')?.competencia).toBe('2026-09');
    expect(await chaves({ origem: 'compartilhamento' })).toEqual(['b']);
  });

  it('nunca sobrescreve nem remove laudo gravado em competência bloqueada', async () => {
    await repo.aplicar(
      importacaoId,
      janela,
      {
        ...vazio,
        inserir: [
          laudo('a'),
          laudo('b'),
          laudo('aberto', { competencia: '2026-11' }),
          laudo('vai', { competencia: '2026-11' }),
        ],
      },
      agora,
    );
    const antes = await db.select().from(schema.laudos).orderBy(schema.laudos.identidade);
    const [exame] = await db
      .insert(schema.exames)
      .values({ nome: 'TC TORAX', chaveNormalizada: 'tc torax' })
      .returning();
    const bloqueada = { ...janela, competenciasBloqueadas: ['2026-10'] };

    // Como se o plano tivesse falhado: tenta mover 'a' para um mês aberto, 'vai' para o bloqueado
    // e remover 'b'.
    await repo.aplicar(
      importacaoId,
      bloqueada,
      {
        ...vazio,
        atualizar: [
          laudo('a', {
            hashConteudo: 'novo',
            competencia: '2026-11',
            pecas: [{ exameId: exame?.id ?? '', categoriaId: null }],
          }),
          laudo('aberto', { hashConteudo: 'novo', competencia: '2026-11' }),
          laudo('vai', { hashConteudo: 'novo', competencia: '2026-10' }),
        ],
        inserir: [laudo('c', { competencia: '2026-11' })],
        remover: ['b'],
        linhasBrutas: new Map([['a', { EMPRESA: 'CLINICA X' }]]),
        pacientes: new Map([['a', { nome: 'Fulano', codigo: '1', conferencia: 'p1' }]]),
        idsMedico: new Map([['a', { medicoIdMobilemed: 45, medicoReassinaturaIdMobilemed: 46 }]]),
      },
      agora,
    );

    const depois = await db.select().from(schema.laudos).orderBy(schema.laudos.identidade);
    const intactos = (l: { identidade: string }) => ['a', 'b', 'vai'].includes(l.identidade);
    expect(depois.filter(intactos)).toEqual(antes.filter(intactos));
    expect(depois.find((l) => l.identidade === 'aberto')?.hashConteudo).toBe('novo');
    expect(depois.find((l) => l.identidade === 'c')?.competencia).toBe('2026-11');
    expect(await db.select().from(schema.laudosPecasQuebra)).toEqual([]);
    expect(await db.select().from(schema.laudosLinhasBrutas)).toEqual([]);
    expect(await db.select().from(schema.laudosPacientes)).toEqual([]);
  });

  it('atualiza pelo identidade, troca as peças da quebra e desfaz a remoção', async () => {
    await repo.aplicar(importacaoId, janela, { ...vazio, inserir: [laudo('a')] }, agora);
    await repo.aplicar(importacaoId, janela, { ...vazio, remover: ['a'] }, agora);
    expect((await repo.existentesNaJanela(janela)).get('a')?.removido).toBe(true);

    const [exame] = await db
      .insert(schema.exames)
      .values({ nome: 'TC TORAX', chaveNormalizada: 'tc torax' })
      .returning();
    await repo.aplicar(
      importacaoId,
      janela,
      {
        ...vazio,
        atualizar: [
          laudo('a', {
            hashConteudo: 'novo',
            status: 'Reassinado',
            pecas: [{ exameId: exame?.id ?? '', categoriaId: null }],
          }),
        ],
      },
      agora,
    );

    expect((await repo.existentesNaJanela(janela)).get('a')).toEqual({
      hashConteudo: 'novo',
      removido: false,
      competencia: '2026-10',
      pacienteConferencia: null,
      medicoIdMobilemed: null,
      medicoReassinaturaIdMobilemed: null,
    });
    const [gravado] = await db.select().from(schema.laudos);
    expect(gravado?.status).toBe('Reassinado');
    expect(await db.select().from(schema.laudosPecasQuebra)).toHaveLength(1);
  });

  it('grava o id da conta MobileMed dos médicos e o atualiza junto com o médico', async () => {
    const [ana] = await db
      .insert(schema.medicos)
      .values({ nome: 'Ana Souza', chaveNormalizada: 'ana souza', idMobilemed: 45 })
      .returning();
    await repo.aplicar(
      importacaoId,
      janela,
      { ...vazio, inserir: [laudo('a', { medicoOrigem: 'Dra. Ana Souza Prado' })] },
      agora,
    );
    await repo.aplicar(
      importacaoId,
      janela,
      {
        ...vazio,
        atualizar: [
          laudo('a', {
            hashConteudo: 'com-medico',
            medicoOrigem: 'Dra. Ana Souza Prado',
            medicoId: ana?.id ?? '',
            medicoIdMobilemed: 45,
            medicoReassinaturaIdMobilemed: 46,
          }),
        ],
      },
      agora,
    );

    const [gravado] = await db.select().from(schema.laudos);
    expect(gravado).toMatchObject({
      medicoId: ana?.id,
      medicoIdMobilemed: 45,
      medicoReassinaturaIdMobilemed: 46,
    });
  });

  it('recalcula os totais dos dias da janela, sem os removidos', async () => {
    await repo.aplicar(
      importacaoId,
      janela,
      {
        ...vazio,
        inserir: [
          // laudo 6/10 13:00, realizado 5/10 11:00 (TAT 1560 min), prazo 6/10 12:00 (atraso 60)
          laudo('a', { volume: 2 }),
          laudo('b', { dataPrazo: new Date('2026-10-06T14:00:00Z') }),
          laudo('c', { status: 'Reassinado', dataPrazo: null }),
          laudo('x'),
        ],
      },
      agora,
    );
    await repo.aplicar(importacaoId, janela, { ...vazio, remover: ['x'] }, agora);

    const totais = await db
      .select()
      .from(schema.totaisLaudosDia)
      .orderBy(schema.totaisLaudosDia.status);
    expect(totais).toEqual([
      expect.objectContaining({
        dia: '2026-10-06',
        status: 'Assinado',
        quantidade: 2,
        volume: 3,
        comPrazo: 2,
        atrasados: 1,
        somaTatMinutos: 3120,
        somaAtrasoMinutos: 60,
      }),
      expect.objectContaining({ status: 'Reassinado', quantidade: 1, comPrazo: 0, atrasados: 0 }),
    ]);
  });

  describe('totais só dos dias afetados', () => {
    const semana: JanelaLaudos = { ...janela, inicio: '2026-10-01', fim: '2026-10-10' };
    const noDia = (dia: string) => ({
      diaLaudo: dia,
      dataLaudo: new Date(`${dia}T13:00:00Z`),
      dataPrazo: new Date(`${dia}T12:00:00Z`),
    });

    /** Total de mentira num dia: se o dia for refeito, ele some. */
    const sentinela = (dia: string) =>
      db.insert(schema.totaisLaudosDia).values({
        dia,
        status: 'SENTINELA',
        quantidade: 99,
        volume: 99,
        comPrazo: 0,
        atrasados: 0,
        somaTatMinutos: 0,
        somaAtrasoMinutos: 0,
      });

    const totais = () =>
      db
        .select()
        .from(schema.totaisLaudosDia)
        .orderBy(schema.totaisLaudosDia.dia, schema.totaisLaudosDia.status);

    const quantidadePorDia = async () =>
      Object.fromEntries(
        (await totais()).map((t) => [`${t.dia} ${t.status}`, t.quantidade] as const),
      );

    beforeEach(async () => {
      await repo.aplicar(
        importacaoId,
        semana,
        {
          ...vazio,
          inserir: [
            laudo('a', noDia('2026-10-06')),
            laudo('b', noDia('2026-10-06')),
            laudo('c', noDia('2026-10-07')),
          ],
        },
        agora,
      );
    });

    it('refaz só os dias dos laudos gravados; os outros dias da janela ficam intactos', async () => {
      await sentinela('2026-10-08');
      await sentinela('2026-10-07');

      await repo.aplicar(
        importacaoId,
        semana,
        {
          ...vazio,
          atualizar: [laudo('a', { ...noDia('2026-10-06'), hashConteudo: 'novo', volume: 3 })],
        },
        agora,
      );

      expect(await quantidadePorDia()).toEqual({
        '2026-10-06 Assinado': 2,
        '2026-10-07 Assinado': 1,
        '2026-10-07 SENTINELA': 99,
        '2026-10-08 SENTINELA': 99,
      });
      expect((await totais())[0]?.volume).toBe(4);
    });

    it('laudo que mudou de dia atualiza o dia antigo e o novo, mesmo fora da janela', async () => {
      // 'f' foi gravado num dia fora da janela que a importação seguinte cobre.
      await repo.aplicar(
        importacaoId,
        { ...semana, inicio: '2026-09-30', fim: '2026-09-30' },
        { ...vazio, inserir: [laudo('f', noDia('2026-09-30'))] },
        agora,
      );

      await repo.aplicar(
        importacaoId,
        semana,
        {
          ...vazio,
          atualizar: [laudo('a', { ...noDia('2026-10-09'), hashConteudo: 'novo' })],
          // Fora da janela gravada, o plano o vê como novo; o upsert o move de dia.
          inserir: [laudo('f', { ...noDia('2026-10-09'), hashConteudo: 'novo' })],
        },
        agora,
      );

      expect(await quantidadePorDia()).toEqual({
        '2026-10-06 Assinado': 1,
        '2026-10-07 Assinado': 1,
        '2026-10-09 Assinado': 2,
      });
    });

    it('laudo removido sai do total do seu dia, sem refazer os outros', async () => {
      await sentinela('2026-10-07');

      await repo.aplicar(importacaoId, semana, { ...vazio, remover: ['a'] }, agora);

      expect(await quantidadePorDia()).toEqual({
        '2026-10-06 Assinado': 1,
        '2026-10-07 Assinado': 1,
        '2026-10-07 SENTINELA': 99,
      });
    });

    it('laudo de competência bloqueada não altera os totais', async () => {
      await sentinela('2026-10-06');
      await sentinela('2026-10-09');
      const antes = await totais();

      await repo.aplicar(
        importacaoId,
        { ...semana, competenciasBloqueadas: ['2026-10'] },
        {
          ...vazio,
          atualizar: [laudo('a', { ...noDia('2026-10-09'), hashConteudo: 'novo' })],
          remover: ['b'],
        },
        agora,
      );

      expect(await totais()).toEqual(antes);
    });

    it('importação sem mudanças nos laudos não toca os totais', async () => {
      await sentinela('2026-10-06');
      const antes = await totais();

      await repo.aplicar(
        importacaoId,
        semana,
        {
          ...vazio,
          pacientes: new Map([['a', { nome: 'Fulano', codigo: '1', conferencia: 'p1' }]]),
          idsMedico: new Map([
            ['b', { medicoIdMobilemed: 45, medicoReassinaturaIdMobilemed: null }],
          ]),
        },
        agora,
      );

      expect(await totais()).toEqual(antes);
    });

    it('o resultado é igual ao recálculo completo dos laudos', async () => {
      await repo.aplicar(
        importacaoId,
        semana,
        {
          ...vazio,
          inserir: [laudo('d', { ...noDia('2026-10-02'), status: 'Reassinado', volume: 2 })],
          atualizar: [
            laudo('a', { ...noDia('2026-10-07'), hashConteudo: 'novo', dataPrazo: null }),
            laudo('c', { ...noDia('2026-10-07'), hashConteudo: 'novo', volume: 5 }),
          ],
          remover: ['b'],
        },
        agora,
      );

      const recalculo = await db.execute(sql`
        select dia_laudo::text dia, status, count(*)::int quantidade, sum(volume)::float volume,
          count(data_prazo)::int com_prazo,
          count(*) filter (where data_laudo > data_prazo)::int atrasados
        from laudos where removido_em is null
        group by dia_laudo, cliente_id, modalidade_id, especialidade_id, prioridade_id, medico_id,
          status
        order by 1, 2
      `);
      expect(
        (await totais()).map((t) => ({
          dia: t.dia,
          status: t.status,
          quantidade: t.quantidade,
          volume: t.volume,
          com_prazo: t.comPrazo,
          atrasados: t.atrasados,
        })),
      ).toEqual(recalculo.rows);
      expect(recalculo.rows).toHaveLength(2);
    });
  });

  it('o expurgo apaga só as linhas cruas gravadas antes do instante', async () => {
    await repo.aplicar(
      importacaoId,
      janela,
      { ...vazio, inserir: [laudo('a')], linhasBrutas: new Map([['a', { EMPRESA: 'X' }]]) },
      agora,
    );
    const linhas = new DrizzleLinhasBrutasRepository(db);

    expect(await linhas.expurgarAntesDe(new Date('2000-01-01'))).toBe(0);
    expect(await linhas.expurgarAntesDe(new Date(Date.now() + 60_000))).toBe(1);
    expect(await db.select().from(schema.laudosLinhasBrutas)).toEqual([]);
    expect(await db.select().from(schema.laudos)).toHaveLength(1);
  });

  describe('recálculo da competência', () => {
    let clienteX: string;
    let clienteY: string;

    beforeEach(async () => {
      const sufixo = Math.random().toString(36).slice(2);
      const criados = await db
        .insert(schema.clientes)
        .values([
          { nome: `X ${sufixo}`, chaveNormalizada: `x ${sufixo}` },
          { nome: `Y ${sufixo}`, chaveNormalizada: `y ${sufixo}` },
        ])
        .returning({ id: schema.clientes.id });
      clienteX = criados[0]?.id ?? '';
      clienteY = criados[1]?.id ?? '';
      await repo.aplicar(
        importacaoId,
        janela,
        {
          ...vazio,
          inserir: [
            laudo('x1', { clienteId: clienteX }),
            laudo('x2', { clienteId: clienteX, competencia: '2026-09' }),
            laudo('y1', { clienteId: clienteY }),
            laudo('s1'),
          ],
        },
        agora,
      );
    });

    const idsPorIdentidade = async () =>
      new Map((await db.select().from(schema.laudos)).map((l) => [l.id, l.identidade] as const));

    it('lê em lotes por id, só dos clientes pedidos e fora das competências bloqueadas', async () => {
      const identidades = await idsPorIdentidade();
      const primeiro = await repo.lerParaRecalculo({
        clienteIds: [clienteX, clienteY],
        competenciasBloqueadas: ['2026-09'],
        depoisDe: null,
        limite: 1,
      });
      const resto = await repo.lerParaRecalculo({
        clienteIds: [clienteX, clienteY],
        competenciasBloqueadas: ['2026-09'],
        depoisDe: primeiro[0]?.id ?? null,
        limite: 10,
      });

      expect(primeiro).toHaveLength(1);
      expect([...primeiro, ...resto].map((l) => identidades.get(l.id)).sort()).toEqual([
        'x1',
        'y1',
      ]);
      expect(primeiro[0]).toMatchObject({
        dataRealizacao: new Date('2026-10-05T11:00:00Z'),
        dataLaudo: new Date('2026-10-06T13:00:00Z'),
        competencia: '2026-10',
      });
    });

    it('sem clientes, lê todos, inclusive os sem cliente', async () => {
      const lidos = await repo.lerParaRecalculo({
        clienteIds: null,
        competenciasBloqueadas: [],
        depoisDe: null,
        limite: 10,
      });

      expect(lidos).toHaveLength(4);
      expect(lidos.find((l) => l.clienteId === null)).toBeDefined();
    });

    it('reclassificação: lê com a tipificação gravada e grava unidade e tipificação fora das bloqueadas', async () => {
      const [co] = await db
        .insert(schema.regrasTipificacao)
        .values({ nome: 'CO', padrao: true })
        .returning();
      const CO = { regraId: co?.id ?? '', subregraId: null, fatura: true };
      const identidades = await idsPorIdentidade();
      const id = (identidade: string) =>
        [...identidades].find(([, i]) => i === identidade)?.[0] ?? '';
      const ler = () =>
        repo.lerParaReclassificacao({
          clienteIds: [clienteX],
          competenciasBloqueadas: [],
          depoisDe: null,
          limite: 10,
        });

      const antes = await ler();
      expect(antes.map((l) => [identidades.get(l.id), l.tipificacao]).sort()).toEqual([
        ['x1', null],
        ['x2', null],
      ]);
      expect(antes[0]).toMatchObject({
        empresaOrigem: 'CLINICA X',
        clienteId: clienteX,
        unidadeId: null,
      });

      await repo.gravarReclassificacao(
        [
          { id: id('x1'), unidadeId: clienteY, tipificacao: CO },
          { id: id('x2'), unidadeId: clienteY, tipificacao: CO },
        ],
        ['2026-09'],
        new Date('2026-11-24T12:00:00Z'),
      );
      const depois = new Map((await ler()).map((l) => [identidades.get(l.id), l]));
      expect(depois.get('x1')).toMatchObject({ unidadeId: clienteY, tipificacao: CO });
      expect(depois.get('x2')).toMatchObject({ unidadeId: null, tipificacao: null });
    });

    it('a competência que muda reclassifica a tipificação dos clientes desses laudos (a versão vale pela competência)', async () => {
      await db.execute(sql`delete from graphile_worker._private_jobs`);
      const [x1] = await db
        .select()
        .from(schema.laudos)
        .where(sql`${schema.laudos.identidade} = 'x1'`);
      await repo.atualizarCompetencias([{ id: x1?.id ?? '', competencia: '2026-11' }], agora);
      const jobs = await db.execute<{ task: string; payload: unknown }>(
        sql`select t.identifier task, j.payload from graphile_worker._private_jobs j
          join graphile_worker._private_tasks t on t.id = j.task_id`,
      );
      expect(jobs.rows).toEqual([
        { task: 'ingestao.reclassificar-tipificacao', payload: { clienteIds: [clienteX] } },
      ]);
    });

    it('atualiza só a competência dos laudos indicados', async () => {
      const [x1] = await db
        .select()
        .from(schema.laudos)
        .where(sql`${schema.laudos.identidade} = 'x1'`);
      const depois = new Date('2026-11-24T12:00:00Z');

      await repo.atualizarCompetencias([{ id: x1?.id ?? '', competencia: '2026-11' }], depois);

      const laudos = await db.select().from(schema.laudos);
      const porIdentidade = new Map(laudos.map((l) => [l.identidade, l]));
      expect(porIdentidade.get('x1')).toMatchObject({
        competencia: '2026-11',
        hashConteudo: 'h-x1',
        atualizadoEm: depois,
      });
      expect(porIdentidade.get('y1')?.competencia).toBe('2026-10');
    });
  });
});
