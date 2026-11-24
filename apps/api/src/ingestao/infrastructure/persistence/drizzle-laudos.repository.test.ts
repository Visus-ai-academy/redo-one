import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
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
    repo = new DrizzleLaudosRepository(db);
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table laudos, totais_laudos_dia, importacoes, arquivos, medicos cascade`,
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
