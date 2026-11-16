import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { asc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { existePermissao } from './catalogo';

// Roda contra um Postgres de verdade. Sem TEST_DATABASE_URL, aparece como "skipped".
const url = process.env.TEST_DATABASE_URL;
const pasta = resolve(__dirname, '../../../drizzle');

/** A tabela de conversão do contrato de permissões CRUD (16/11/2026). */
const CONVERSAO: Record<string, string[]> = {
  'clientes.editar': ['clientes.criar', 'clientes.editar', 'clientes.excluir'],
  'medicos.editar': ['medicos.criar', 'medicos.editar', 'medicos.excluir'],
  'exames.editar': ['exames.criar', 'exames.editar', 'exames.excluir'],
  'catalogo.editar': ['catalogo.criar', 'catalogo.editar', 'catalogo.excluir'],
  'de-para.editar': ['de-para.criar', 'de-para.editar', 'de-para.excluir'],
  'contratos.editar': ['contratos.criar', 'contratos.editar', 'contratos.excluir'],
  'papeis.editar': ['papeis.criar', 'papeis.editar', 'papeis.excluir'],
  'escala-config.editar': ['escala-config.criar', 'escala-config.editar', 'escala-config.excluir'],
  'importacao.enviar': ['importacao.criar'],
  'escala.alocacao.editar': ['escala.criar', 'escala.editar', 'escala.excluir'],
  'escala.ver': ['escala.ver', 'ausencias.ver'],
  'escala.ausencia.editar': [
    'ausencias.ver',
    'ausencias.criar',
    'ausencias.editar',
    'ausencias.excluir',
    'ausencias.observacoes.ver',
  ],
  'escala.ausencia.aprovar': ['ausencias.ver', 'ausencias.aprovar', 'ausencias.observacoes.ver'],
  'escala.historico.ver': ['escala-historico.ver'],
  'usuarios.convidar': ['usuarios.criar'],
};

describe.skipIf(!url)('migração 0014: permissões dos papéis para o formato CRUD', () => {
  let pool: Pool;
  let db: Database;
  const comandos = readFileSync(resolve(pasta, '0014_permissoes_crud.sql'), 'utf8')
    .split('--> statement-breakpoint')
    .map((c) => c.trim())
    .filter(Boolean);

  async function rodarMigracao() {
    for (const comando of comandos) await db.execute(sql.raw(comando));
  }

  async function papel(nome: string, permissoes: string[]) {
    const [criado] = await db.insert(schema.papeis).values({ nome }).returning();
    if (!criado) throw new Error('o insert não devolveu o papel');
    if (permissoes.length) {
      await db
        .insert(schema.papeisPermissoes)
        .values(permissoes.map((permissao) => ({ papelId: criado.id, permissao })));
    }
    return criado.id;
  }

  async function permissoesDe(papelId: string) {
    const linhas = await db
      .select({ permissao: schema.papeisPermissoes.permissao })
      .from(schema.papeisPermissoes)
      .where(eq(schema.papeisPermissoes.papelId, papelId))
      .orderBy(asc(schema.papeisPermissoes.permissao));
    return linhas.map((l) => l.permissao);
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: pasta });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table papeis_permissoes, papeis cascade`);
  });

  it.each(Object.entries(CONVERSAO))('%s vira %j', async (antiga, novas) => {
    const id = await papel('Papel', [antiga]);

    await rodarMigracao();

    expect(await permissoesDe(id)).toEqual([...novas].sort());
    for (const chave of novas) expect(existePermissao(chave)).toBe(true);
  });

  it('converte um papel inteiro, mantém as demais chaves e roda duas vezes com o mesmo resultado', async () => {
    const coordenacao = await papel('Coordenação da escala', [
      'escala.ver',
      'escala.alocacao.editar',
      'escala.ausencia.aprovar',
      'escala.historico.ver',
      'escala-config.ver',
      'escala-config.editar',
      'medicos.ver',
      'faturamento.competencia.fechar',
      'faturamento.ver',
      'usuarios.escopo-escala.editar',
      'usuarios.ver',
    ]);
    const leitura = await papel('Só leitura', ['clientes.ver', 'volumetria.ver']);
    const vazio = await papel('Vazio', []);

    await rodarMigracao();
    const depois = await permissoesDe(coordenacao);
    await rodarMigracao();

    expect(depois).toEqual(
      [
        'ausencias.aprovar',
        'ausencias.observacoes.ver',
        'ausencias.ver',
        'escala-config.criar',
        'escala-config.editar',
        'escala-config.excluir',
        'escala-config.ver',
        'escala-historico.ver',
        'escala.criar',
        'escala.editar',
        'escala.excluir',
        'escala.ver',
        'faturamento.competencia.fechar',
        'faturamento.ver',
        'medicos.ver',
        'usuarios.escopo-escala.editar',
        'usuarios.ver',
      ].sort(),
    );
    expect(await permissoesDe(coordenacao)).toEqual(depois);
    expect(depois.every(existePermissao)).toBe(true);
    expect(await permissoesDe(leitura)).toEqual(['clientes.ver', 'volumetria.ver']);
    expect(await permissoesDe(vazio)).toEqual([]);
  });

  it('quem só via a escala ganha ver ausências, mas não as observações', async () => {
    const id = await papel('Consulta', ['escala.ver']);

    await rodarMigracao();

    expect(await permissoesDe(id)).not.toContain('ausencias.observacoes.ver');
  });
});
