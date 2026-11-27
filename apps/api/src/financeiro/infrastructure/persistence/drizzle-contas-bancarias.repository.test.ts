import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { DadosContaBancaria } from '../../domain/conta-bancaria';
import { DrizzleContasBancariasRepository } from './drizzle-contas-bancarias.repository';
import { DrizzleEmpresas } from './drizzle-empresas';

// Roda contra um Postgres de verdade. Sem TEST_DATABASE_URL, aparece como "skipped".
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleContasBancariasRepository e DrizzleEmpresas', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzleContasBancariasRepository;
  let empresas: DrizzleEmpresas;
  let tele: string;
  let rn: string;
  const base = (parcial: Partial<DadosContaBancaria> = {}): DadosContaBancaria => ({
    contratadoId: tele,
    apelido: 'Itaú cobrança',
    tipo: 'corrente',
    bancoCodigo: '341',
    agencia: '0123',
    conta: '45678',
    digito: '9',
    saldoInicialCentavos: -1500,
    saldoInicialEm: '2026-12-01',
    integracao: 'nenhuma',
    credencial: null,
    padraoRecebimento: false,
    ativa: true,
    ...parcial,
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    repo = new DrizzleContasBancariasRepository(db);
    empresas = new DrizzleEmpresas(db);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table contas_bancarias, contratados cascade`);
    const linhas = await db
      .insert(schema.contratados)
      .values([
        { razaoSocial: '001 TELEIMAGEM', usaFinanceiro: true },
        { razaoSocial: '002 RADIOLOGIA NACIONAL' },
        { razaoSocial: '003 INATIVA', usaFinanceiro: true, ativo: false },
      ])
      .returning({ id: schema.contratados.id });
    tele = linhas[0]?.id ?? '';
    rn = linhas[1]?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('empresas: só os contratados ativos que usam o financeiro', async () => {
    expect(await empresas.listar()).toEqual([{ id: tele, nome: '001 TELEIMAGEM' }]);
    expect(await empresas.usaFinanceiro(tele)).toBe(true);
    expect(await empresas.usaFinanceiro(rn)).toBe(false);
  });

  it('grava e lê com o nome da empresa, o saldo negativo e a data; filtra por empresa e situação', async () => {
    const id = await repo.criar(base());
    await repo.criar(base({ apelido: 'Caixa', tipo: 'caixa', ativa: false, bancoCodigo: null }));

    expect(await repo.buscar(id)).toMatchObject({
      empresaNome: '001 TELEIMAGEM',
      saldoInicialCentavos: -1500,
      saldoAtualCentavos: -1500,
      saldoInicialEm: '2026-12-01',
    });
    const todas = await repo.listar({
      empresa: 'todas',
      situacao: 'todas',
      pagina: 1,
      porPagina: 10,
    });
    expect(todas.itens.map((c) => c.apelido)).toEqual(['Caixa', 'Itaú cobrança']);
    expect(todas.total).toBe(2);
    const ativas = await repo.listar({
      empresa: { id: tele },
      situacao: 'ativas',
      busca: '4567',
      pagina: 1,
      porPagina: 10,
    });
    expect(ativas.itens.map((c) => c.apelido)).toEqual(['Itaú cobrança']);
    expect(
      (await repo.listar({ empresa: { id: rn }, situacao: 'todas', pagina: 1, porPagina: 10 }))
        .total,
    ).toBe(0);
  });

  it('acha pelo apelido sem diferenciar maiúsculas e a padrão da empresa; o banco garante uma padrão só', async () => {
    const id = await repo.criar(base({ padraoRecebimento: true }));

    expect(await repo.buscarPorApelido(tele, 'ITAÚ COBRANÇA')).toEqual({ id });
    expect(await repo.buscarPadrao(tele)).toEqual({ id });
    await expect(repo.criar(base({ apelido: 'Outra', padraoRecebimento: true }))).rejects.toThrow();
    await repo.desmarcarPadrao(id);
    expect(await repo.buscarPadrao(tele)).toBeNull();
  });

  it('o banco recusa integração sem credencial', async () => {
    await expect(repo.criar(base({ integracao: 'itau', credencial: null }))).rejects.toThrow();
  });

  it('exclui', async () => {
    const id = await repo.criar(base());
    expect(await repo.excluir(id)).toBe(true);
    expect(await repo.buscar(id)).toBeNull();
  });
});
