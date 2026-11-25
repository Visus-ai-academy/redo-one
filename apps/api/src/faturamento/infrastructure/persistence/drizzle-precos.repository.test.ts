import { resolve } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { Dono } from '../../application/ports/precos.repository';
import { type DadosPreco, VersaoAlteradaError } from '../../domain/versoes-preco';
import { DrizzlePrecosRepository } from './drizzle-precos.repository';

const url = process.env.TEST_DATABASE_URL;
const sufixo = `${Math.random()}`.slice(2, 8);

describe.skipIf(!url)('DrizzlePrecosRepository', () => {
  let pool: Pool;
  let db: Database;
  let repo: DrizzlePrecosRepository;
  let cliente: Dono;
  let unidade: Dono;
  let contratado: Dono;
  let dados: DadosPreco;
  let usuarioId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    repo = new DrizzlePrecosRepository(db);
    const um = async <T extends { id: string }>(p: Promise<T[]>) => (await p)[0] as T;
    usuarioId = (
      await um(
        db
          .insert(schema.usuarios)
          .values({ nome: 'Ana', email: `precos-${sufixo}@exemplo.com` })
          .returning(),
      )
    ).id;
    const principal = await um(
      db
        .insert(schema.clientes)
        .values({ nome: `PRECO_P_${sufixo}`, chaveNormalizada: `p${sufixo}` })
        .returning(),
    );
    const uni = await um(
      db
        .insert(schema.clientes)
        .values({
          nome: `PRECO_U_${sufixo}`,
          chaveNormalizada: `u${sufixo}`,
          unificadoEmId: principal.id,
        })
        .returning(),
    );
    const ct = await um(
      db
        .insert(schema.contratados)
        .values({ razaoSocial: `CT_${sufixo}` })
        .returning(),
    );
    cliente = { tipo: 'cliente', id: principal.id };
    unidade = { tipo: 'cliente', id: uni.id };
    contratado = { tipo: 'contratado', id: ct.id };
    const mod = await um(
      db
        .insert(schema.modalidades)
        .values({ codigo: `M${sufixo}` })
        .returning(),
    );
    const esp = await um(
      db
        .insert(schema.especialidades)
        .values({ nome: `E${sufixo}` })
        .returning(),
    );
    const cat = await um(
      db
        .insert(schema.categoriasExame)
        .values({ nome: `C${sufixo}` })
        .returning(),
    );
    const pri = await um(
      db
        .insert(schema.prioridades)
        .values({ nome: `P${sufixo}` })
        .returning(),
    );
    dados = {
      modalidadeId: mod.id,
      especialidadeId: esp.id,
      categoriaId: cat.id,
      prioridadeId: pri.id,
      faixaInicio: 1,
      faixaFim: 299,
      condVolume: 'TOTAL',
      valor: 63.5,
    };
  });

  afterAll(async () => {
    await pool.end();
  });

  it('dono: cliente com o principal da unidade, contratado e inexistente', async () => {
    expect(await repo.obterDono(unidade)).toEqual({
      nome: `PRECO_U_${sufixo}`,
      principal: { id: cliente.id, nome: `PRECO_P_${sufixo}` },
    });
    expect(await repo.obterDono(contratado)).toEqual({ nome: `CT_${sufixo}`, principal: null });
    expect(
      await repo.obterDono({ tipo: 'cliente', id: '00000000-0000-4000-8000-000000000000' }),
    ).toBeNull();
  });

  it('cria, encerra conferindo o fim anterior e lista com os nomes', async () => {
    const [id] = await repo.aplicar(
      cliente,
      [{ tipo: 'criar', dados, vigenciaDesde: '2026-11', vigenciaAte: null }],
      { usuarioId },
    );
    await repo.aplicar(
      cliente,
      [{ tipo: 'encerrar', id: id as string, vigenciaAteAntes: null, vigenciaAte: '2026-12' }],
      { usuarioId },
    );
    // Outra pessoa já mudou: nada é gravado.
    await expect(
      repo.aplicar(
        cliente,
        [
          {
            tipo: 'criar',
            dados: { ...dados, valor: 1 },
            vigenciaDesde: '2027-01',
            vigenciaAte: null,
          },
          { tipo: 'encerrar', id: id as string, vigenciaAteAntes: null, vigenciaAte: '2027-01' },
        ],
        { usuarioId },
      ),
    ).rejects.toThrow(VersaoAlteradaError);
    const versoes = await repo.listarVersoes(cliente, dados);
    expect(versoes).toEqual([
      {
        id,
        ...dados,
        vigenciaDesde: '2026-11',
        vigenciaAte: '2026-12',
        nomes: {
          modalidade: `M${sufixo}`,
          especialidade: `E${sufixo}`,
          categoria: `C${sufixo}`,
          prioridade: `P${sufixo}`,
        },
      },
    ]);
    expect(await repo.listarVersoes(unidade)).toEqual([]);
  });

  it('só apaga a versão que começa depois do mês atual', async () => {
    const [futura, atual] = await repo.aplicar(
      contratado,
      [
        { tipo: 'criar', dados, vigenciaDesde: '2999-01', vigenciaAte: null },
        {
          tipo: 'criar',
          dados: { ...dados, faixaInicio: 300, faixaFim: null },
          vigenciaDesde: '2020-01',
          vigenciaAte: null,
        },
      ],
      { usuarioId },
    );
    await repo.aplicar(contratado, [{ tipo: 'remover', id: futura as string }], { usuarioId });
    await expect(
      repo.aplicar(contratado, [{ tipo: 'remover', id: atual as string }], { usuarioId }),
    ).rejects.toThrow(VersaoAlteradaError);
    expect((await repo.listarVersoes(contratado)).map((v) => v.id)).toEqual([atual]);
  });

  it('eventos da auditoria por versão, com o nome de quem fez', async () => {
    const [id] = await repo.aplicar(
      cliente,
      [
        {
          tipo: 'criar',
          dados: { ...dados, faixaInicio: 500, faixaFim: null },
          vigenciaDesde: '2027-01',
          vigenciaAte: null,
        },
      ],
      { usuarioId },
    );
    const em = new Date('2026-11-25T12:00:00Z');
    await db.insert(schema.eventosAuditoria).values([
      {
        ocorridoEm: em,
        atorTipo: 'usuario',
        atorId: usuarioId,
        entidade: 'preco_cliente',
        entidadeId: id as string,
        acao: 'criado',
      },
      {
        ocorridoEm: em,
        atorTipo: 'usuario',
        atorId: usuarioId,
        entidade: 'preco_padrao_contratado',
        entidadeId: id as string,
        acao: 'criado',
      },
    ]);
    expect(await repo.eventos(cliente, [id as string])).toEqual(
      new Map([[id, [{ acao: 'criado', quem: 'Ana', em }]]]),
    );
  });

  it('opções trazem os cadastros ativos', async () => {
    const o = await repo.opcoes();
    expect(o.modalidades).toContainEqual({ id: dados.modalidadeId, nome: `M${sufixo}` });
    expect(o.contratados).toContainEqual({ id: contratado.id, nome: `CT_${sufixo}` });
  });
});
