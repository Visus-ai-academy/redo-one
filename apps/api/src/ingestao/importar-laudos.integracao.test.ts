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
import { DrizzleCompetenciasRepository } from '../faturamento/infrastructure/persistence/drizzle-competencias.repository';
import { DrizzleCortesRepository } from '../faturamento/infrastructure/persistence/drizzle-cortes.repository';
import type { PlanilhaLida } from './application/ports/leitor-planilha';
import { ImportarLaudos } from './application/use-cases/importar-laudos';
import { itemParaRegistro, itemRelatorio } from './infrastructure/mobilemed/esquemas-relatorio';
import { DrizzleAvisosCadastroRepository } from './infrastructure/persistence/drizzle-avisos-cadastro.repository';
import { DrizzleCadastrosIngestao } from './infrastructure/persistence/drizzle-cadastros-ingestao';
import { DrizzleImportacoesRepository } from './infrastructure/persistence/drizzle-importacoes.repository';
import { DrizzleLaudosRepository } from './infrastructure/persistence/drizzle-laudos.repository';
import { DrizzleParametrosIngestaoRepository } from './infrastructure/persistence/drizzle-parametros-ingestao.repository';
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

const linha = (codigo: string, estudo: string, valores: number, medico = 'Dr. Desconhecido') => [
  'CLINICA X',
  'Paciente Teste',
  codigo,
  estudo,
  `ACC${codigo}`,
  'CT',
  'Rotina',
  valores,
  'MEDICINA INTERNA',
  medico,
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

  /** O que o relatório da MobileMed devolve na importação pela API. */
  let relatorio: PlanilhaLida = { formato: 'laudos', linhas: [] };

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
    return processar(importacao?.id ?? '');
  };

  const importarDaMobileMed = async (itens: Record<string, unknown>[]) => {
    relatorio = {
      formato: 'laudos',
      linhas: itens.map((item, i) => ({
        numero: i + 1,
        registro: itemParaRegistro(itemRelatorio.parse(item), 'laudos'),
      })),
    };
    const [importacao] = await db
      .insert(schema.importacoes)
      .values({
        origem: 'mobilemed',
        formato: 'laudos',
        janelaInicio: '2026-10-06',
        janelaFim: '2026-10-06',
      })
      .returning();
    return processar(importacao?.id ?? '');
  };

  const processar = async (importacaoId: string) => {
    await new ImportarLaudos(
      new DrizzleImportacoesRepository(db),
      armazenamento,
      new XlsxLeitorPlanilha(),
      new DrizzleCadastrosIngestao(db),
      new DrizzleCompetenciasRepository(db),
      new DrizzleCortesRepository(db),
      new DrizzleLaudosRepository(db),
      new DrizzleAvisosCadastroRepository(db),
      new DrizzleParametrosIngestaoRepository(db),
      new HmacPseudonimizador('s'.repeat(64)),
      { buscar: async () => relatorio },
      () => new Date(),
    ).executar(importacaoId);
    const [resultado] = await db
      .select()
      .from(schema.importacoes)
      .where(sql`${schema.importacoes.id} = ${importacaoId}`);
    return resultado;
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table competencias, laudos, totais_laudos_dia, avisos_cadastro, importacoes, arquivos,
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
    // A competência do laudo gravado passa a existir, aberta.
    const competencias = await db.select().from(schema.competencias);
    expect(competencias.map((c) => [c.competencia, c.status])).toEqual([['2026-10', 'aberta']]);
    expect(JSON.stringify(laudo)).not.toContain('Paciente Teste');
    // O nome e o código vão à parte, em `laudos_pacientes`.
    const pacientes = await db.select().from(schema.laudosPacientes);
    expect(pacientes.map((p) => [p.nome, p.codigo]).sort()).toEqual([
      ['Paciente Teste', '1'],
      ['Paciente Teste', '2'],
      ['Paciente Teste', '3'],
    ]);

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

  it('o laudo igual do upload ganha o id da conta pela MobileMed sem contar como atualizado', async () => {
    await db
      .insert(schema.medicos)
      .values({ nome: 'Ana Souza', chaveNormalizada: 'ana souza', idMobilemed: 45 });
    expect(await importar([linha('1', 'TC TORAX', 1, 'Dra. Ana Souza')])).toMatchObject({
      inseridos: 1,
    });
    expect((await db.select().from(schema.laudos))[0]?.medicoIdMobilemed).toBeNull();
    const brutas = (await db.select().from(schema.laudosLinhasBrutas)).length;

    const daApi = await importarDaMobileMed([
      {
        nome_fantasia: 'CLINICA X',
        nome_paciente: 'Paciente Teste',
        codigo_paciente: '1',
        estudo_descricao: 'TC TORAX',
        pacs_accession_no: 'ACC1',
        modalidade_id: 2,
        prioridade_id: 1,
        status_id: 1,
        valor: '1',
        especialidade: 'MEDICINA INTERNA',
        medico: 'Dra. Ana Souza',
        usuario_id: 45,
        medico_primeiro_laudo: null,
        medico_primeiro_laudo_id: null,
        is_duplicado: 0,
        is_anterior: 0,
        data_realizacao: '2026-10-05T11:00:00.000Z',
        data_laudo: '2026-10-06T13:00:00.000Z',
        sla_expiration_date: '2026-10-06T12:00:00.000Z',
      },
    ]);

    expect(daApi).toMatchObject({ status: 'concluida', atualizados: 0, inalterados: 1 });
    expect((await db.select().from(schema.laudos))[0]?.medicoIdMobilemed).toBe(45);
    expect(await db.select().from(schema.laudosLinhasBrutas)).toHaveLength(brutas);
  });

  it('a MobileMed liga pelo id da conta o laudo que o nome deixou sem médico, sem duplicar', async () => {
    const [ana] = await db
      .insert(schema.medicos)
      .values({ nome: 'Ana Souza', chaveNormalizada: 'ana souza', idMobilemed: 45 })
      .returning();
    // O nome na MobileMed tem um sobrenome a mais que o cadastro.
    const doUpload = await importar([linha('1', 'TC TORAX', 1, 'Dra. Ana Souza Prado')]);
    expect(doUpload).toMatchObject({ status: 'concluida', inseridos: 1 });
    expect((await db.select().from(schema.laudos))[0]?.medicoId).toBeNull();

    // O mesmo laudo pela API (05/10 08:00 e 06/10 10:00 em Brasília), agora com a conta.
    const daApi = await importarDaMobileMed([
      {
        nome_fantasia: 'CLINICA X',
        nome_paciente: 'Paciente Teste',
        codigo_paciente: '1',
        estudo_descricao: 'TC TORAX',
        pacs_accession_no: 'ACC1',
        modalidade_id: 2,
        prioridade_id: 1,
        status_id: 1,
        valor: '1',
        especialidade: 'MEDICINA INTERNA',
        medico: 'Dra. Ana Souza Prado',
        usuario_id: 45,
        medico_primeiro_laudo: null,
        medico_primeiro_laudo_id: null,
        is_duplicado: 0,
        is_anterior: 0,
        data_realizacao: '2026-10-05T11:00:00.000Z',
        data_laudo: '2026-10-06T13:00:00.000Z',
        sla_expiration_date: '2026-10-06T12:00:00.000Z',
      },
    ]);

    expect(daApi).toMatchObject({
      status: 'concluida',
      inseridos: 0,
      atualizados: 1,
      removidos: 0,
    });
    const laudos = await db.select().from(schema.laudos);
    expect(laudos).toHaveLength(1);
    expect(laudos[0]).toMatchObject({ medicoId: ana?.id, medicoIdMobilemed: 45 });
    const [total] = await db.select().from(schema.totaisLaudosDia);
    expect(total?.medicoId).toBe(ana?.id);
    const [aviso] = await db.select().from(schema.avisosCadastro);
    expect(aviso).toMatchObject({ tipo: 'medico', chave: 'ana souza prado', status: 'resolvido' });
    // O paciente da API é o mesmo do upload: uma linha só, com o nome e o código.
    const pacientes = await db.select().from(schema.laudosPacientes);
    expect(pacientes.map((p) => [p.laudoId, p.nome, p.codigo])).toEqual([
      [laudos[0]?.id, 'Paciente Teste', '1'],
    ]);
  });
});
