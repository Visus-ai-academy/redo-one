import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { FiltroTitulos } from '../../application/ports/titulos.repository';
import type { DadosTitulo } from '../../domain/titulo';
import { DrizzleContasBancariasRepository } from './drizzle-contas-bancarias.repository';
import { DrizzleFavorecidos } from './drizzle-favorecidos';
import { DrizzleTitulosRepository } from './drizzle-titulos.repository';

// Roda contra um Postgres de verdade. Sem TEST_DATABASE_URL, aparece como "skipped".
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleTitulosRepository e DrizzleFavorecidos', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleTitulosRepository;
  let favorecidos: DrizzleFavorecidos;
  let contas: DrizzleContasBancariasRepository;
  let tele: string;
  let despesa: string;
  let receita: string;
  let omega: string;
  let medico: string;
  let prn: string;
  let unidade: string;
  let conta: string;

  const pagar = (parcial: Partial<DadosTitulo> = {}): DadosTitulo => ({
    contratadoId: tele,
    favorecido: { tipo: 'fornecedor', id: omega },
    categoriaId: despesa,
    descricao: 'Honorários',
    documento: 'NF 77',
    competencia: '2026-11',
    emissaoEm: '2026-11-01',
    vencimento: '2026-11-05',
    valorCentavos: 120_000,
    contaPrevistaId: null,
    observacoes: null,
    ...parcial,
  });
  const filtro = (parcial: Partial<FiltroTitulos> = {}): FiltroTitulos => ({
    tipo: 'pagar',
    empresa: 'todas',
    situacao: 'todas',
    origem: 'todas',
    categoria: 'todas',
    pagina: 1,
    porPagina: 25,
    hoje: '2026-11-27',
    ...parcial,
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    repo = new DrizzleTitulosRepository(db);
    favorecidos = new DrizzleFavorecidos(db);
    contas = new DrizzleContasBancariasRepository(db);
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table baixas, titulos, titulos_numeracao, contas_bancarias, fornecedores, categorias_financeiras, medicos, clientes, contratados cascade`,
    );
    const [empresa] = await db
      .insert(schema.contratados)
      .values({ razaoSocial: '001 TELEIMAGEM', usaFinanceiro: true })
      .returning({ id: schema.contratados.id });
    tele = empresa?.id ?? '';
    const cats = await db
      .insert(schema.categoriasFinanceiras)
      .values([
        { tipo: 'despesa', nome: 'Contabilidade' },
        { tipo: 'receita', nome: 'Receita de laudos' },
      ])
      .returning({ id: schema.categoriasFinanceiras.id });
    despesa = cats[0]?.id ?? '';
    receita = cats[1]?.id ?? '';
    const [f] = await db
      .insert(schema.fornecedores)
      .values({ tipoPessoa: 'PJ', razaoSocial: 'Ômega Contábil', cnpj: '12345678000190' })
      .returning({ id: schema.fornecedores.id });
    omega = f?.id ?? '';
    const [m] = await db
      .insert(schema.medicos)
      .values({ nome: 'Ana Prado', chaveNormalizada: 'ANA PRADO' })
      .returning({ id: schema.medicos.id });
    medico = m?.id ?? '';
    const [principal] = await db
      .insert(schema.clientes)
      .values({ nome: 'PRN', chaveNormalizada: 'PRN' })
      .returning({ id: schema.clientes.id });
    prn = principal?.id ?? '';
    const [u] = await db
      .insert(schema.clientes)
      .values({ nome: 'PRN TELE_X', chaveNormalizada: 'PRN TELE X', unificadoEmId: prn })
      .returning({ id: schema.clientes.id });
    unidade = u?.id ?? '';
    conta = await contas.criar({
      contratadoId: tele,
      apelido: 'Itaú',
      tipo: 'corrente',
      bancoCodigo: null,
      agencia: null,
      conta: null,
      digito: null,
      saldoInicialCentavos: 1_000_000,
      saldoInicialEm: '2026-11-01',
      integracao: 'nenhuma',
      credencial: null,
      padraoRecebimento: false,
      ativa: true,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('numera por empresa e tipo e lê com os nomes', async () => {
    const a = await repo.criar({ tipo: 'pagar', dados: pagar(), criadoPorId: null });
    const b = await repo.criar({
      tipo: 'pagar',
      dados: pagar({ favorecido: { tipo: 'medico', id: medico } }),
      criadoPorId: null,
    });
    const r = await repo.criar({
      tipo: 'receber',
      dados: pagar({ favorecido: { tipo: 'cliente', id: prn }, categoriaId: receita }),
      criadoPorId: null,
    });

    expect([a.numero, b.numero, r.numero]).toEqual([1, 2, 1]);
    expect(await repo.buscar(a.id)).toMatchObject({
      numero: 1,
      empresaNome: '001 TELEIMAGEM',
      favorecido: { tipo: 'fornecedor', id: omega, nome: 'Ômega Contábil' },
      categoriaNome: 'Contabilidade',
      situacao: 'aberto',
      baixas: [],
    });
    expect((await repo.buscar(b.id))?.favorecido).toEqual({
      tipo: 'medico',
      id: medico,
      nome: 'Ana Prado',
    });
  });

  it('o banco recusa favorecido do tipo errado', async () => {
    await expect(
      repo.criar({
        tipo: 'pagar',
        dados: pagar({ favorecido: { tipo: 'cliente', id: prn } }),
        criadoPorId: null,
      }),
    ).rejects.toThrow();
  });

  it('filtra por situação, vencidos, favorecido e busca (nome, número, documento), com os totais', async () => {
    const vencido = await repo.criar({ tipo: 'pagar', dados: pagar(), criadoPorId: null });
    await repo.criar({
      tipo: 'pagar',
      dados: pagar({
        vencimento: '2026-12-10',
        valorCentavos: 50_000,
        favorecido: { tipo: 'medico', id: medico },
        documento: null,
      }),
      criadoPorId: null,
    });

    const todos = await repo.listar(filtro({ situacao: 'em_aberto' }));
    expect(todos.total).toBe(2);
    expect(todos.totais).toEqual({ abertoCentavos: 170_000, vencidoCentavos: 120_000 });
    expect((await repo.listar(filtro({ situacao: 'vencidos' }))).itens.map((t) => t.id)).toEqual([
      vencido.id,
    ]);
    expect((await repo.listar(filtro({ favorecido: { tipo: 'medico', id: medico } }))).total).toBe(
      1,
    );
    expect((await repo.listar(filtro({ busca: 'omega' }))).total).toBe(0);
    expect((await repo.listar(filtro({ busca: 'Ômega' }))).total).toBe(1);
    expect((await repo.listar(filtro({ busca: 'P-0002' }))).itens[0]?.numero).toBe(2);
    expect((await repo.listar(filtro({ busca: 'NF 77' }))).total).toBe(1);
    expect(
      (await repo.listar(filtro({ vencimentoDe: '2026-12-01', vencimentoAte: '2026-12-31' })))
        .total,
    ).toBe(1);
    expect((await repo.listar(filtro({ tipo: 'receber' }))).total).toBe(0);
  });

  it('baixa e estorno dentro da trava, e o saldo da conta acompanha', async () => {
    const { id } = await repo.criar({ tipo: 'pagar', dados: pagar(), criadoPorId: null });
    const baixaId = await repo.alterar(id, async (titulo, escrita) => {
      expect(titulo).toMatchObject({ situacao: 'aberto', pagoCentavos: 0, baixas: [] });
      const nova = await escrita.inserirBaixa({
        pagoEm: '2026-11-27',
        contaBancariaId: conta,
        principalCentavos: 100_000,
        jurosCentavos: 500,
        multaCentavos: 0,
        descontoCentavos: 0,
        valorMovimentadoCentavos: 100_500,
        forma: 'pix',
        observacao: null,
        criadoPorId: null as unknown as string,
      });
      await escrita.atualizar({ pagoCentavos: 100_000, situacao: 'parcial' });
      return nova;
    });

    expect((await contas.buscar(conta))?.saldoAtualCentavos).toBe(1_000_000 - 100_500);
    const detalhe = await repo.buscar(id);
    expect(detalhe).toMatchObject({ situacao: 'parcial', pagoCentavos: 100_000 });
    expect(detalhe?.baixas[0]).toMatchObject({ id: baixaId, contaNome: 'Itaú', forma: 'pix' });

    await repo.alterar(id, async (titulo, escrita) => {
      expect(titulo?.baixas).toEqual([
        { id: baixaId, principalCentavos: 100_000, estornadaEm: null },
      ]);
      await escrita.estornarBaixa(baixaId, {
        em: new Date('2026-11-27T15:00:00Z'),
        porId: null as unknown as string,
        motivo: 'errado',
      });
      await escrita.atualizar({ pagoCentavos: 0, situacao: 'aberto' });
    });
    expect((await contas.buscar(conta))?.saldoAtualCentavos).toBe(1_000_000);
    expect((await repo.buscar(id))?.baixas[0]?.motivoEstorno).toBe('errado');
  });

  it('erro dentro da trava desfaz o que ela gravou', async () => {
    const { id } = await repo.criar({ tipo: 'pagar', dados: pagar(), criadoPorId: null });
    await expect(
      repo.alterar(id, async (_t, escrita) => {
        await escrita.atualizar({ descricao: 'mudou' });
        throw new Error('falhou');
      }),
    ).rejects.toThrow('falhou');
    expect((await repo.buscar(id))?.descricao).toBe('Honorários');
  });

  it('edita os dados e troca o favorecido', async () => {
    const { id } = await repo.criar({ tipo: 'pagar', dados: pagar(), criadoPorId: null });
    await repo.alterar(id, async (_t, escrita) => {
      await escrita.atualizar({
        ...pagar({ favorecido: { tipo: 'medico', id: medico }, descricao: 'Plantão' }),
      });
    });
    expect(await repo.buscar(id)).toMatchObject({
      descricao: 'Plantão',
      favorecido: { tipo: 'medico', id: medico },
    });
  });

  it('favorecidos: a receber só clientes principais; a pagar fornecedores e médicos ativos', async () => {
    expect((await favorecidos.opcoes('receber', undefined, 10)).map((o) => o.nome)).toEqual([
      'PRN',
    ]);
    expect((await favorecidos.opcoes('pagar', undefined, 10)).map((o) => o.tipo)).toEqual([
      'medico',
      'fornecedor',
    ]);
    expect((await favorecidos.opcoes('pagar', 'ana', 10)).map((o) => o.nome)).toEqual([
      'Ana Prado',
    ]);
    expect(await favorecidos.buscar({ tipo: 'cliente', id: unidade })).toEqual({
      nome: 'PRN TELE_X',
      ativo: true,
      unidadeDe: 'PRN',
    });
    expect(await favorecidos.buscar({ tipo: 'fornecedor', id: medico })).toBeNull();
  });
});
