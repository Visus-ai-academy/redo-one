import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { ReferenciaInexistenteError } from '../comum/catalogo.errors';
import {
  DrizzleDeParaRepository,
  TABELA_DE_PARA_ESPECIALIDADE,
  TABELA_DE_PARA_MODALIDADE,
  TABELA_DE_PARA_PRIORIDADE,
  TABELA_DE_PARA_VALOR,
  TABELA_SUFIXO,
} from './drizzle-de-para.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleDeParaRepository', () => {
  let pool: Pool;
  let db: Database;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table prioridades, especialidades, exames, modalidades, sufixos_nome_cliente cascade`,
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('prioridade: lista com o nome do destino e acha a mesma origem', async () => {
    const [p] = await db.insert(schema.prioridades).values({ nome: 'ROTINA' }).returning();
    const repo = new DrizzleDeParaRepository(db, TABELA_DE_PARA_PRIORIDADE);
    const id = await repo.criar({ origem: 'Eletivo', prioridadeId: p?.id ?? '', ativo: true });

    expect((await repo.listar({ busca: 'elet', pagina: 1, porPagina: 10 })).itens).toEqual([
      { id, origem: 'Eletivo', prioridadeId: p?.id, ativo: true, destinoNome: 'ROTINA' },
    ]);
    expect(await repo.buscarIgual({ origem: 'Eletivo', prioridadeId: 'x', ativo: true })).toEqual({
      id,
    });
    await expect(
      repo.criar({
        origem: 'X',
        prioridadeId: '00000000-0000-4000-8000-000000000000',
        ativo: true,
      }),
    ).rejects.toThrow(ReferenciaInexistenteError);
  });

  it('especialidade: filtra por tipo; inválida fica sem destino', async () => {
    const [e] = await db.insert(schema.especialidades).values({ nome: 'MAMA' }).returning();
    const repo = new DrizzleDeParaRepository(db, TABELA_DE_PARA_ESPECIALIDADE);
    const base = { ativo: true, observacoes: null };
    await repo.criar({
      ...base,
      tipo: 'normalizacao',
      origem: 'MAMO',
      especialidadeId: e?.id ?? null,
    });
    await repo.criar({ ...base, tipo: 'invalida', origem: 'RX', especialidadeId: null });

    const invalidas = await repo.listar({ tipo: 'invalida', pagina: 1, porPagina: 10 });
    expect(invalidas.itens).toEqual([expect.objectContaining({ origem: 'RX', destinoNome: null })]);
    expect(
      await repo.buscarIgual({ ...base, tipo: 'invalida', origem: 'MAMO', especialidadeId: null }),
    ).toBeNull();
  });

  it('variações de uma forma certa: filtra pelo destino', async () => {
    const [rotina, urgencia] = await db
      .insert(schema.prioridades)
      .values([{ nome: 'ROTINA' }, { nome: 'URGÊNCIA' }])
      .returning();
    const repo = new DrizzleDeParaRepository(db, TABELA_DE_PARA_PRIORIDADE);
    for (const [origem, p] of [
      ['Urgência', urgencia],
      ['URGENCIA', urgencia],
      ['Rotina', rotina],
    ] as const) {
      await repo.criar({ origem, prioridadeId: p?.id ?? '', ativo: true });
    }

    const { itens, total } = await repo.listar({
      destinoId: urgencia?.id,
      pagina: 1,
      porPagina: 10,
    });
    expect(total).toBe(2);
    expect(itens.map((i) => i.origem)).toEqual(['URGENCIA', 'Urgência']);
  });

  it('modalidade: variações pela modalidade de destino', async () => {
    const [dens, rx] = await db
      .insert(schema.modalidades)
      .values([{ codigo: 'DO' }, { codigo: 'RX' }])
      .returning();
    const repo = new DrizzleDeParaRepository(db, TABELA_DE_PARA_MODALIDADE);
    const ot = await repo.criar({ origem: 'OT', modalidadeId: dens?.id ?? '', ativo: true });
    await repo.criar({ origem: 'CR', modalidadeId: rx?.id ?? '', ativo: true });

    expect((await repo.listar({ destinoId: dens?.id, pagina: 1, porPagina: 10 })).itens).toEqual([
      { id: ot, origem: 'OT', modalidadeId: dens?.id, ativo: true, destinoNome: 'DO' },
    ]);
    expect(await repo.buscarIgual({ origem: 'OT', modalidadeId: 'x', ativo: true })).toEqual({
      id: ot,
    });
  });

  it('valores: grava a chave normalizada e acha grafias equivalentes', async () => {
    const repo = new DrizzleDeParaRepository(db, TABELA_DE_PARA_VALOR);
    const id = await repo.criar({
      estudoDescricao: 'RM CRÂNIO',
      valores: 2.5,
      exameId: null,
      ativo: true,
    });

    expect(await repo.buscar(id)).toMatchObject({ valores: 2.5, destinoNome: null });
    expect(
      await repo.buscarIgual({
        estudoDescricao: 'rm-cranio',
        valores: 1,
        exameId: null,
        ativo: true,
      }),
    ).toEqual({ id });
  });

  it('sufixo: acha sem diferenciar maiúsculas', async () => {
    const repo = new DrizzleDeParaRepository(db, TABELA_SUFIXO);
    const id = await repo.criar({ sufixo: '_RMX', ativo: true, observacoes: null });

    expect(await repo.buscarIgual({ sufixo: '_rmx', ativo: true, observacoes: null })).toEqual({
      id,
    });
    await repo.excluir(id);
    expect(await repo.buscar(id)).toBeNull();
  });

  it('sufixo: criar, atualizar e excluir avisam na mesma transação', async () => {
    let vezes = 0;
    let falhar = false;
    const repo = new DrizzleDeParaRepository(db, TABELA_SUFIXO, async () => {
      vezes++;
      if (falhar) throw new Error('aviso falhou');
    });

    const id = await repo.criar({ sufixo: '_RMX', ativo: true, observacoes: null });
    await repo.atualizar(id, { sufixo: '_RMX', ativo: false, observacoes: null });
    expect(vezes).toBe(2);

    falhar = true;
    await expect(repo.excluir(id)).rejects.toThrow('aviso falhou');
    expect(await repo.buscar(id)).toMatchObject({ sufixo: '_RMX', ativo: false });
    falhar = false;
    await repo.excluir(id);
    expect(vezes).toBe(4);
    expect(await repo.buscar(id)).toBeNull();
  });
});
