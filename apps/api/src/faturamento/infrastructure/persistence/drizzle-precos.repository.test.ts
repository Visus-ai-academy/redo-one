import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { eq } from 'drizzle-orm';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { EventoAuditoria } from '../../../auditoria/auditoria';
import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { Dono } from '../../application/ports/precos.repository';
import {
  type DadosPreco,
  VersaoAlteradaError,
  VersaoConflitanteError,
  VigenciaPrecoInvalidaError,
} from '../../domain/versoes-preco';
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

  const criar = (d: DadosPreco, vigenciaDesde: string, vigenciaAte: string | null = null) => ({
    tipo: 'criar' as const,
    id: randomUUID(),
    dados: d,
    vigenciaDesde,
    vigenciaAte,
  });
  // Competência sem fechamento possível (outros testes deixam competências fechadas no banco).
  const opcoes = (eventos: EventoAuditoria[] = [], aPartirDe = '2999-06') => ({
    usuarioId,
    aPartirDe,
    eventos,
  });

  it('cria, encerra conferindo o fim anterior e lista com os nomes', async () => {
    const nova = criar(dados, '2026-11');
    await repo.aplicar(cliente, [nova], opcoes());
    await repo.aplicar(
      cliente,
      [{ tipo: 'encerrar', id: nova.id, vigenciaAteAntes: null, vigenciaAte: '2026-12' }],
      opcoes(),
    );
    // Outra pessoa já mudou: nada é gravado (nem a versão nova do mesmo lote).
    await expect(
      repo.aplicar(
        cliente,
        [
          criar({ ...dados, valor: 1 }, '2027-01'),
          { tipo: 'encerrar', id: nova.id, vigenciaAteAntes: null, vigenciaAte: '2027-01' },
        ],
        opcoes(),
      ),
    ).rejects.toThrow(VersaoAlteradaError);
    expect(await repo.listarVersoes(cliente, dados)).toEqual([
      {
        id: nova.id,
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

  it('duas inclusões ao mesmo tempo do mesmo arranjo e faixa: só uma entra', async () => {
    const d = { ...dados, faixaInicio: 700, faixaFim: null };
    const resultados = await Promise.allSettled([
      repo.aplicar(unidade, [criar(d, '2027-02')], opcoes()),
      repo.aplicar(unidade, [criar({ ...d, valor: 99 }, '2027-03')], opcoes()),
    ]);
    expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const falha = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(falha.reason).toBeInstanceOf(VersaoConflitanteError);
    expect(await repo.listarVersoes(unidade)).toHaveLength(1);
  });

  it('reabrir confere o fim de antes; versão reaberta que cruza outra é recusada', async () => {
    const d = { ...dados, faixaInicio: 800, faixaFim: null };
    const a = criar(d, '2026-01', '2026-12');
    const b = criar(d, '2027-01');
    await repo.aplicar(contratado, [a, b], opcoes());
    await expect(
      repo.aplicar(
        contratado,
        [{ tipo: 'reabrir', id: a.id, vigenciaAteAntes: '2026-12', vigenciaAte: null }],
        opcoes(),
      ),
    ).rejects.toThrow(VersaoConflitanteError);
    await expect(
      repo.aplicar(
        contratado,
        [{ tipo: 'reabrir', id: a.id, vigenciaAteAntes: '2026-11', vigenciaAte: null }],
        opcoes(),
      ),
    ).rejects.toThrow(VersaoAlteradaError);
  });

  it('competência fechada ou travada a partir da mudança: nada é gravado', async () => {
    await db
      .insert(schema.competencias)
      .values({ competencia: '2998-05', status: 'fechada' })
      .onConflictDoNothing();
    const d = { ...dados, faixaInicio: 900, faixaFim: null };
    await expect(
      repo.aplicar(cliente, [criar(d, '2998-01')], opcoes([], '2998-01')),
    ).rejects.toThrow(VigenciaPrecoInvalidaError);
    await db.delete(schema.competencias).where(eq(schema.competencias.competencia, '2998-05'));
    expect((await repo.listarVersoes(cliente)).some((v) => v.faixaInicio === 900)).toBe(false);
  });

  it('só apaga a versão que começa depois do mês atual', async () => {
    const futura = criar(dados, '2999-01');
    const atual = criar({ ...dados, faixaInicio: 300, faixaFim: null }, '2020-01');
    await repo.aplicar(contratado, [futura, atual], opcoes());
    // Quem leu a versão sem fim não a apaga depois que outra pessoa a encerrou.
    await repo.aplicar(
      contratado,
      [{ tipo: 'encerrar', id: futura.id, vigenciaAteAntes: null, vigenciaAte: '2999-03' }],
      opcoes(),
    );
    await expect(
      repo.aplicar(
        contratado,
        [{ tipo: 'remover', id: futura.id, vigenciaAteAntes: null }],
        opcoes(),
      ),
    ).rejects.toThrow(VersaoAlteradaError);
    await repo.aplicar(
      contratado,
      [{ tipo: 'remover', id: futura.id, vigenciaAteAntes: '2999-03' }],
      opcoes(),
    );
    await expect(
      repo.aplicar(
        contratado,
        [{ tipo: 'remover', id: atual.id, vigenciaAteAntes: null }],
        opcoes(),
      ),
    ).rejects.toThrow(VersaoAlteradaError);
    expect((await repo.listarVersoes(contratado)).map((v) => v.id)).toContain(atual.id);
    expect((await repo.listarVersoes(contratado)).map((v) => v.id)).not.toContain(futura.id);
  });

  it('os eventos de auditoria entram na mesma transação; lidos com o nome de quem fez', async () => {
    const em = new Date('2026-11-25T12:00:00Z');
    const nova = criar({ ...dados, faixaInicio: 500, faixaFim: null }, '2027-01');
    const evento = (id: string): EventoAuditoria => ({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: 'preco_cliente',
      entidadeId: id,
      acao: 'criado',
      em,
    });
    await repo.aplicar(cliente, [nova], opcoes([evento(nova.id)]));
    expect(await repo.eventos(cliente, [nova.id])).toEqual(
      new Map([[nova.id, [{ acao: 'criado', quem: 'Ana', em }]]]),
    );
    // A mudança falhou: o evento também não fica.
    const repetida = criar({ ...dados, faixaInicio: 500, faixaFim: null }, '2027-05');
    await expect(repo.aplicar(cliente, [repetida], opcoes([evento(repetida.id)]))).rejects.toThrow(
      VersaoConflitanteError,
    );
    expect(await repo.eventos(cliente, [repetida.id])).toEqual(new Map());
  });

  it('opções trazem os cadastros ativos, e o contratado diz se é o padrão', async () => {
    const o = await repo.opcoes();
    expect(o.modalidades).toContainEqual({ id: dados.modalidadeId, nome: `M${sufixo}` });
    expect(o.contratados).toContainEqual({
      id: contratado.id,
      nome: `CT_${sufixo}`,
      padrao: false,
    });
  });
});
