import { resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { DadosRecorrencia } from '../../domain/recorrencia';
import type { DadosTitulo } from '../../domain/titulo';
import { DrizzleRecorrenciasRepository } from './drizzle-recorrencias.repository';
import { DrizzleTitulosRepository } from './drizzle-titulos.repository';

// Roda contra um Postgres de verdade. Sem TEST_DATABASE_URL, aparece como "skipped".
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleRecorrenciasRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleRecorrenciasRepository;
  let titulos: DrizzleTitulosRepository;
  let tele: string;
  let despesa: string;
  let omega: string;

  const dados = (parcial: Partial<DadosRecorrencia> = {}): DadosRecorrencia => ({
    contratadoId: tele,
    favorecido: { tipo: 'fornecedor', id: omega },
    categoriaId: despesa,
    descricao: 'Aluguel da sala',
    valorCentavos: 950_000,
    modoValor: 'fixo',
    frequencia: 'mensal',
    diaVencimento: 5,
    primeiroVencimento: '2026-12-05',
    ajusteDiaNaoUtil: null,
    termino: 'sem',
    terminoEm: null,
    terminoOcorrencias: null,
    contaPrevistaId: null,
    observacoes: null,
    ...parcial,
  });
  const titulo = (vencimento: string): DadosTitulo => ({
    contratadoId: tele,
    favorecido: { tipo: 'fornecedor', id: omega },
    categoriaId: despesa,
    descricao: 'Aluguel da sala',
    documento: null,
    competencia: null,
    emissaoEm: '2026-11-27',
    vencimento,
    valorCentavos: 950_000,
    contaPrevistaId: null,
    observacoes: null,
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    repo = new DrizzleRecorrenciasRepository(db);
    titulos = new DrizzleTitulosRepository(db);
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table baixas, titulos, titulos_numeracao, recorrencias, fornecedores, categorias_financeiras, contratados cascade`,
    );
    const [empresa] = await db
      .insert(schema.contratados)
      .values({ razaoSocial: '001 TELEIMAGEM', usaFinanceiro: true })
      .returning({ id: schema.contratados.id });
    tele = empresa?.id ?? '';
    const [cat] = await db
      .insert(schema.categoriasFinanceiras)
      .values({ tipo: 'despesa', nome: 'Aluguel' })
      .returning({ id: schema.categoriasFinanceiras.id });
    despesa = cat?.id ?? '';
    const [f] = await db
      .insert(schema.fornecedores)
      .values({ tipoPessoa: 'PJ', razaoSocial: 'Sala comercial', cnpj: '12345678000190' })
      .returning({ id: schema.fornecedores.id });
    omega = f?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('grava, lê com os nomes e gera os títulos numerados, sem repetir a ocorrência', async () => {
    const id = await repo.criar('pagar', dados(), {
      geraAPartirDe: '2026-12-05',
      criadoPorId: null as unknown as string,
    });
    // Um título manual antes: a recorrência continua a mesma sequência.
    await titulos.criar({ tipo: 'pagar', dados: titulo('2026-12-01'), criadoPorId: null });
    const criados = await repo.gerarTitulos(
      id,
      'pagar',
      [
        { ocorrencia: 1, dados: titulo('2026-12-07') },
        { ocorrencia: 2, dados: titulo('2027-01-05') },
      ],
      null,
    );
    expect(criados.map((c) => [c.numero, c.ocorrencia])).toEqual([
      [2, 1],
      [3, 2],
    ]);
    const de_novo = await repo.gerarTitulos(
      id,
      'pagar',
      [
        { ocorrencia: 2, dados: titulo('2027-01-05') },
        { ocorrencia: 3, dados: titulo('2027-02-05') },
      ],
      null,
    );
    expect(de_novo.map((c) => c.ocorrencia)).toEqual([3]);

    expect(await repo.buscar(id)).toMatchObject({
      descricao: 'Aluguel da sala',
      favorecido: { tipo: 'fornecedor', id: omega },
      favorecidoNome: 'Sala comercial',
      empresaNome: '001 TELEIMAGEM',
      categoriaNome: 'Aluguel',
      situacao: 'ativa',
      geraAPartirDe: '2026-12-05',
      ocorrencias: [1, 2, 3],
    });
    const [primeiro] = (
      await titulos.listar({
        tipo: 'pagar',
        empresa: 'todas',
        situacao: 'todas',
        origem: 'recorrencia',
        categoria: 'todas',
        recorrenciaId: id,
        pagina: 1,
        porPagina: 10,
        hoje: '2026-11-27',
      })
    ).itens;
    expect(primeiro).toMatchObject({ origem: 'recorrencia', recorrenciaId: id, ocorrencia: 1 });
    expect((await titulos.buscar(primeiro?.id ?? ''))?.recorrencia).toEqual({
      id,
      descricao: 'Aluguel da sala',
      modoValor: 'fixo',
    });
  });

  it('lista com o próximo vencimento em aberto e as ativas para o previsto', async () => {
    const id = await repo.criar('pagar', dados(), {
      geraAPartirDe: '2026-12-05',
      criadoPorId: null as unknown as string,
    });
    const pausada = await repo.criar('pagar', dados({ descricao: 'Internet' }), {
      geraAPartirDe: '2026-12-05',
      criadoPorId: null as unknown as string,
    });
    await repo.atualizar(pausada, { situacao: 'pausada' });
    await repo.gerarTitulos(
      id,
      'pagar',
      [
        { ocorrencia: 1, dados: titulo('2026-11-05') },
        { ocorrencia: 2, dados: titulo('2026-12-05') },
      ],
      null,
    );
    const pagina = await repo.listar({
      tipo: 'pagar',
      empresa: 'todas',
      situacao: 'todas',
      frequencia: 'todas',
      pagina: 1,
      porPagina: 25,
      hoje: '2026-11-27',
    });
    expect(pagina.itens.map((i) => [i.descricao, i.situacao, i.proximoVencimento])).toEqual([
      ['Aluguel da sala', 'ativa', '2026-12-05'],
      ['Internet', 'pausada', null],
    ]);
    expect(pagina.ativas).toEqual([{ valorCentavos: 950_000, frequencia: 'mensal' }]);
    expect((await repo.ativas()).length).toBe(1);
    expect(
      (
        await repo.listar({
          tipo: 'pagar',
          empresa: 'todas',
          situacao: 'todas',
          frequencia: 'todas',
          busca: 'sala comercial',
          pagina: 1,
          porPagina: 25,
          hoje: '2026-11-27',
        })
      ).total,
    ).toBe(2);
  });

  it('ajustáveis: só em aberto, sem baixa e não editados à mão; aplicar respeita isso', async () => {
    const id = await repo.criar('pagar', dados(), {
      geraAPartirDe: '2026-12-05',
      criadoPorId: null as unknown as string,
    });
    const [a, b, c] = await repo.gerarTitulos(
      id,
      'pagar',
      [1, 2, 3].map((n) => ({ ocorrencia: n, dados: titulo(`2027-0${n}-05`) })),
      null,
    );
    await db
      .update(schema.titulos)
      .set({ editadoAMao: true })
      .where(eq(schema.titulos.id, b?.id ?? ''));
    expect((await repo.titulosAjustaveis(id)).map((t) => t.ocorrencia)).toEqual([1, 3]);
    await db
      .update(schema.titulos)
      .set({ pagoCentavos: 1, situacao: 'parcial' })
      .where(eq(schema.titulos.id, c?.id ?? ''));
    const feitos = await repo.aplicarNosTitulos(
      [a, c].map((t) => ({
        tituloId: t?.id ?? '',
        dados: { ...titulo('2027-01-05'), valorCentavos: 1_000 },
      })),
    );
    expect(feitos).toEqual([a?.id]);
    expect((await titulos.buscar(a?.id ?? ''))?.valorCentavos).toBe(1_000);
  });
});
