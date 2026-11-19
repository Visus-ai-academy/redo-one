import { resolve } from 'node:path';
import { Readable } from 'node:stream';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';

import type { ArmazenamentoArquivos } from '../comum/armazenamento/armazenamento-arquivos';
import type { Database } from '../database/database';
import * as schema from '../database/schema';
import { ImportarLaudos } from './application/use-cases/importar-laudos';
import { DrizzleAvisosCadastroRepository } from './infrastructure/persistence/drizzle-avisos-cadastro.repository';
import { DrizzleCadastrosIngestao } from './infrastructure/persistence/drizzle-cadastros-ingestao';
import { DrizzleImportacoesRepository } from './infrastructure/persistence/drizzle-importacoes.repository';
import { DrizzleLaudosRepository } from './infrastructure/persistence/drizzle-laudos.repository';
import { DrizzleParametrosIngestaoRepository } from './infrastructure/persistence/drizzle-parametros-ingestao.repository';
import { SemCompetenciasBloqueadas } from './infrastructure/persistence/sem-competencias-bloqueadas';
import { HmacPseudonimizador } from './infrastructure/seguranca/hmac-pseudonimizador';
import { XlsxLeitorPlanilha } from './infrastructure/xlsx/xlsx-leitor-planilha';

// Da planilha ao banco: XLSX de verdade, repositórios Drizzle e o Postgres de teste; só o storage
// é trocado por um que devolve o arquivo gerado aqui.
const url = process.env.TEST_DATABASE_URL;

const CABECALHO = [
  'EMPRESA',
  'NOME_PACIENTE',
  'CODIGO_PACIENTE',
  'ESTUDO_DESCRICAO',
  'ACCESSION_NUMBER',
  'MODALIDADE',
  'PRIORIDADE',
  'VALORES',
  'ESPECIALIDADE',
  'MEDICO',
  'DUPLICADO',
  'DATA_REALIZACAO',
  'HORA_REALIZACAO',
  'DATA_TRANSFERENCIA',
  'HORA_TRANSFERENCIA',
  'DATA_LAUDO',
  'HORA_LAUDO',
  'DATA_PRAZO',
  'HORA_PRAZO',
  'STATUS',
  'DATA_REASSINATURA',
  'HORA_REASSINATURA',
  'MEDICO_REASSINATURA',
  'COMPLEMENTAR',
];

const linha = (codigo: string, estudo: string, valores: number) => [
  'CLINICA X',
  'Paciente Teste',
  codigo,
  estudo,
  `ACC${codigo}`,
  'CT',
  'Rotina',
  valores,
  'MEDICINA INTERNA',
  'Dr. Desconhecido',
  'Não',
  '05/10/2026',
  '08:00',
  null,
  null,
  '06/10/2026',
  '10:00',
  '06/10/2026',
  '09:00',
  'Assinado',
  null,
  null,
  null,
  'Não',
];

describe.skipIf(!url)('importar laudos (integração)', () => {
  let pool: Pool;
  let db: Database;
  let arquivo: Buffer;

  const armazenamento = {
    ler: async () => Readable.from(arquivo),
  } as unknown as ArmazenamentoArquivos;

  const importar = async (linhas: (string | number | null)[][]) => {
    arquivo = await writeXlsxFile(
      [CABECALHO, ...linhas].map((l) => l.map((value) => (value === null ? null : { value }))),
    ).toBuffer();
    const [a] = await db
      .insert(schema.arquivos)
      .values({
        chave: `ingestao/${Math.random()}.xlsx`,
        nomeOriginal: 'laudos.xlsx',
        tipoConteudo: 'x',
        contexto: 'ingestao',
      })
      .returning();
    const [importacao] = await db
      .insert(schema.importacoes)
      .values({ arquivoId: a?.id ?? '', origem: 'upload_manual' })
      .returning();
    await new ImportarLaudos(
      new DrizzleImportacoesRepository(db),
      armazenamento,
      new XlsxLeitorPlanilha(),
      new DrizzleCadastrosIngestao(db),
      new SemCompetenciasBloqueadas(),
      new DrizzleLaudosRepository(db),
      new DrizzleAvisosCadastroRepository(db),
      new DrizzleParametrosIngestaoRepository(db),
      new HmacPseudonimizador('s'.repeat(64)),
      { buscar: async () => Promise.reject(new Error('sem MobileMed neste teste')) },
      () => new Date(),
    ).executar(importacao?.id ?? '');
    const [resultado] = await db
      .select()
      .from(schema.importacoes)
      .where(sql`${schema.importacoes.id} = ${importacao?.id}`);
    return resultado;
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table laudos, totais_laudos_dia, avisos_cadastro, importacoes, arquivos,
        clientes, sufixos_nome_cliente, modalidades, especialidades, prioridades, exames,
        quebras_estudo, exames_de_para_valores, medicos cascade`,
    );
    const [ct] = await db.insert(schema.modalidades).values({ codigo: 'CT' }).returning();
    await db.insert(schema.especialidades).values({ nome: 'MEDICINA INTERNA' });
    await db.insert(schema.prioridades).values({ nome: 'ROTINA' });
    await db.insert(schema.clientes).values({ nome: 'CLINICA X', chaveNormalizada: 'clinica x' });
    await db
      .insert(schema.exames)
      .values({ nome: 'TC TORAX', chaveNormalizada: 'tc torax', modalidadeId: ct?.id });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('importa, reimporta sem mudar nada e remove o que sumiu, com totais e avisos', async () => {
    const primeira = await importar([
      linha('1', 'TC TORAX', 1),
      linha('2', 'TC TORAX X1 X2', 2),
      linha('3', 'TC ESTUDO NOVO', 0),
    ]);
    expect(primeira).toMatchObject({ status: 'concluida', inseridos: 3, linhasArquivo: 3 });

    const [total] = await db.select().from(schema.totaisLaudosDia);
    expect(total).toMatchObject({ dia: '2026-10-06', quantidade: 3, volume: 4, atrasados: 3 });
    const avisos = await db
      .select()
      .from(schema.avisosCadastro)
      .orderBy(schema.avisosCadastro.tipo);
    expect(avisos.map((a) => [a.tipo, a.chave, a.ocorrencias])).toEqual([
      ['medico', 'desconhecido', 3],
      ['estudo', 'tc estudo novo', 1],
    ]);
    const [laudo] = await db.select().from(schema.laudos).limit(1);
    expect(JSON.stringify(laudo)).not.toContain('Paciente Teste');

    const segunda = await importar([
      linha('1', 'TC TORAX', 1),
      linha('2', 'TC TORAX X1 X2', 2),
      linha('3', 'TC ESTUDO NOVO', 0),
    ]);
    expect(segunda).toMatchObject({ status: 'concluida', inseridos: 0, inalterados: 3 });

    const terceira = await importar([linha('1', 'TC TORAX', 1), linha('2', 'TC TORAX X1 X2', 2)]);
    expect(terceira).toMatchObject({ removidos: 1, inalterados: 2 });
    const [totalDepois] = await db.select().from(schema.totaisLaudosDia);
    expect(totalDepois).toMatchObject({ quantidade: 2, volume: 3 });
  });
});
