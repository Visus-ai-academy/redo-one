import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { FiltroInadimplencia } from '../../application/ports/configuracoes-financeiras';
import {
  DrizzleConfiguracoesFinanceiras,
  DrizzleInadimplencia,
} from './drizzle-configuracoes-financeiras';

// Roda contra um Postgres de verdade. Sem TEST_DATABASE_URL, aparece como "skipped".
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleConfiguracoesFinanceiras e DrizzleInadimplencia', () => {
  let pool: Pool;
  let db: Database;
  let configs: DrizzleConfiguracoesFinanceiras;
  let inadimplencia: DrizzleInadimplencia;
  let tele: string;
  let rn: string;
  let receita: string;
  let numero = 0;
  const filtro = (parcial: Partial<FiltroInadimplencia> = {}): FiltroInadimplencia => ({
    empresa: 'todas',
    faixa: 'todas',
    hoje: '2026-11-27',
    faixasPadrao: [1, 6, 16, 31],
    pagina: 1,
    porPagina: 25,
    ...parcial,
  });
  const cliente = async (nome: string) => {
    const [c] = await db
      .insert(schema.clientes)
      .values({ nome, chaveNormalizada: nome })
      .returning({ id: schema.clientes.id });
    return c?.id ?? '';
  };
  const titulo = (
    contratadoId: string,
    clienteId: string,
    vencimento: string,
    valorCentavos: number,
    extra: Partial<typeof schema.titulos.$inferInsert> = {},
  ) =>
    db.insert(schema.titulos).values({
      tipo: 'receber',
      contratadoId,
      numero: ++numero,
      clienteId,
      categoriaId: receita,
      descricao: 'Laudos',
      emissaoEm: '2026-09-01',
      vencimento,
      valorCentavos,
      ...extra,
    });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    configs = new DrizzleConfiguracoesFinanceiras(db);
    inadimplencia = new DrizzleInadimplencia(db);
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table configuracoes_financeiras, baixas, titulos, categorias_financeiras, clientes, contratados cascade`,
    );
    const empresas = await db
      .insert(schema.contratados)
      .values([
        { razaoSocial: '001 TELEIMAGEM', usaFinanceiro: true },
        { razaoSocial: '002 RADIOLOGIA NACIONAL', usaFinanceiro: true },
      ])
      .returning({ id: schema.contratados.id });
    tele = empresas[0]?.id ?? '';
    rn = empresas[1]?.id ?? '';
    const [cat] = await db
      .insert(schema.categoriasFinanceiras)
      .values({ tipo: 'receita', nome: 'Receita de laudos' })
      .returning({ id: schema.categoriasFinanceiras.id });
    receita = cat?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('grava e regrava as faixas da empresa; sem linha, nada', async () => {
    expect(await configs.buscar(tele)).toBeNull();
    await configs.salvar(tele, { faixasInadimplencia: [1, 11, 31] }, null as unknown as string);
    await configs.salvar(tele, { faixasInadimplencia: [1, 31] }, null as unknown as string);
    expect(await configs.buscar(tele)).toEqual({ faixasInadimplencia: [1, 31] });
  });

  it('soma por cliente e empresa só o saldo vencido, do maior atraso ao menor, com a faixa da empresa', async () => {
    const hcl = await cliente('HCLONDRINA');
    const prn = await cliente('PRN');
    await titulo(tele, hcl, '2026-10-10', 1_000_000);
    await titulo(tele, hcl, '2026-11-20', 300_000, { pagoCentavos: 100_000, situacao: 'parcial' });
    await titulo(tele, hcl, '2026-12-10', 999_999); // não venceu
    await titulo(tele, hcl, '2026-10-01', 50_000, { situacao: 'cancelado' });
    await titulo(rn, prn, '2026-11-24', 120_000);
    await configs.salvar(rn, { faixasInadimplencia: [1, 3] }, null as unknown as string);

    const r = await inadimplencia.listar(filtro());
    expect(r.total).toBe(2);
    expect(r.totalVencidoCentavos).toBe(1_000_000 + 200_000 + 120_000);
    expect(r.itens).toEqual([
      {
        clienteId: hcl,
        clienteNome: 'HCLONDRINA',
        contratadoId: tele,
        empresaNome: '001 TELEIMAGEM',
        titulos: 2,
        maisAntigo: '2026-10-10',
        diasDeAtraso: 48,
        faixas: [1, 6, 16, 31],
        totalVencidoCentavos: 1_200_000,
      },
      expect.objectContaining({ clienteNome: 'PRN', diasDeAtraso: 3, faixas: [1, 3] }),
    ]);
    expect(
      (await inadimplencia.listar(filtro({ faixa: 31 }))).itens.map((l) => l.clienteNome),
    ).toEqual(['HCLONDRINA']);
    expect(
      (await inadimplencia.listar(filtro({ faixa: 3 }))).itens.map((l) => l.clienteNome),
    ).toEqual(['PRN']);
    expect((await inadimplencia.listar(filtro({ empresa: { id: rn } }))).total).toBe(1);
    expect((await inadimplencia.listar(filtro({ busca: 'hcl' }))).total).toBe(1);
  });
});
