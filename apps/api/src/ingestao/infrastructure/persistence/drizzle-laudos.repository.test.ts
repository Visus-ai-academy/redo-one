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
    await db.execute(sql`truncate table laudos, totais_laudos_dia, importacoes, arquivos cascade`);
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

  const vazio = { inserir: [], atualizar: [], remover: [], linhasBrutas: new Map() };

  it('grava os novos com a linha crua e devolve-os na janela', async () => {
    await repo.aplicar(
      importacaoId,
      janela,
      { ...vazio, inserir: [laudo('a')], linhasBrutas: new Map([['a', { EMPRESA: 'CLINICA X' }]]) },
      agora,
    );

    expect(await repo.existentesNaJanela(janela)).toEqual(
      new Map([['a', { hashConteudo: 'h-a', removido: false }]]),
    );
    const brutas = await db.select().from(schema.laudosLinhasBrutas);
    expect(brutas.map((b) => b.dados)).toEqual([{ EMPRESA: 'CLINICA X' }]);
  });

  it('a janela filtra origem, dias, empresas e competências bloqueadas', async () => {
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
    expect(await chaves({ competenciasBloqueadas: ['2026-09'] })).toEqual(['a', 'd']);
    expect(await chaves({ origem: 'compartilhamento' })).toEqual(['b']);
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
    });
    const [gravado] = await db.select().from(schema.laudos);
    expect(gravado?.status).toBe('Reassinado');
    expect(await db.select().from(schema.laudosPecasQuebra)).toHaveLength(1);
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
});
