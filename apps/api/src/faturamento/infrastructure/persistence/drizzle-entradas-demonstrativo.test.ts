import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { DrizzleEntradasDemonstrativo } from './drizzle-entradas-demonstrativo';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('DrizzleEntradasDemonstrativo', () => {
  let pool: Pool;
  let db: Database;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    await db.execute(
      sql`truncate table laudos, importacoes, parametros_demonstrativo, prioridades_alternativas_preco cascade`,
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('lê os laudos não removidos da competência com tipificação, peças, preços e parâmetros', async () => {
    const s = Math.random().toString(36).slice(2, 8);
    const [cliente] = await db
      .insert(schema.clientes)
      .values({ nome: `ENT_${s}`, chaveNormalizada: `ent_${s}`, ativo: false })
      .returning();
    const [mod] = await db
      .insert(schema.modalidades)
      .values({ codigo: `M${s}` })
      .returning();
    const [esp] = await db
      .insert(schema.especialidades)
      .values({ nome: `E${s}` })
      .returning();
    const [cat] = await db
      .insert(schema.categoriasExame)
      .values({ nome: `C${s}` })
      .returning();
    const [pri] = await db
      .insert(schema.prioridades)
      .values({ nome: `P${s}` })
      .returning();
    const [alt] = await db
      .insert(schema.prioridades)
      .values({ nome: `A${s}` })
      .returning();
    const [exame] = await db
      .insert(schema.exames)
      .values({
        nome: `EX${s}`,
        chaveNormalizada: `ex${s}`,
        modalidadeId: mod?.id,
        especialidadeId: esp?.id,
      })
      .returning();
    const [regra] = await db
      .insert(schema.regrasTipificacao)
      .values({ nome: `R${s}` })
      .returning();
    const [imp] = await db
      .insert(schema.importacoes)
      .values({ origem: 'mobilemed', formato: 'laudos' })
      .returning();
    const base = {
      hashConteudo: 'h',
      importacaoId: imp?.id as string,
      origem: 'normal' as const,
      empresaOrigem: 'X',
      clienteId: cliente?.id,
      pacienteChave: 'p',
      estudo: 'E',
      modalidadeOrigem: 'MR',
      modalidadeId: mod?.id,
      especialidadeId: esp?.id,
      categoriaId: cat?.id,
      prioridadeOrigem: 'R',
      prioridadeId: pri?.id,
      volume: 2,
      status: 'Assinado',
      dataRealizacao: new Date('2026-11-03T12:00:00Z'),
      dataLaudo: new Date('2026-11-03T13:00:00Z'),
      diaLaudo: '2026-11-03',
      competencia: '2026-11',
    };
    const [l1, , l3] = await db
      .insert(schema.laudos)
      .values([
        { ...base, identidade: `a${s}`, duplicado: true },
        { ...base, identidade: `b${s}`, removidoEm: new Date() },
        { ...base, identidade: `c${s}`, status: 'Não Assinado', competencia: '2026-11' },
        { ...base, identidade: `d${s}`, competencia: '2026-10' },
      ])
      .returning();
    await db.insert(schema.classificacoesLaudo).values({
      laudoId: l1?.id as string,
      regraId: regra?.id as string,
      fatura: true,
      calculadoEm: new Date(),
    });
    await db.insert(schema.laudosPecasQuebra).values({
      laudoId: l1?.id as string,
      ordem: 1,
      exameId: exame?.id as string,
      categoriaId: null,
    });
    await db.insert(schema.precosCliente).values({
      clienteId: cliente?.id as string,
      modalidadeId: mod?.id as string,
      especialidadeId: esp?.id as string,
      categoriaId: cat?.id as string,
      prioridadeId: pri?.id as string,
      valor: 63.5,
    });
    await db.insert(schema.parametrosDemonstrativo).values([
      {
        desde: null,
        cobraDuplicados: true,
        cobraClientesInativos: false,
        categoriaPadraoId: cat?.id,
      },
      { desde: '2026-12', cobraDuplicados: false, cobraClientesInativos: false },
    ]);
    await db
      .insert(schema.prioridadesAlternativasPreco)
      .values({ prioridadeId: pri?.id as string, alternativaId: alt?.id, desde: null });

    const { entrada, nomes } = await new DrizzleEntradasDemonstrativo(db).carregar('2026-11');

    const laudos = [...entrada.laudos].sort((a, b) => a.id.localeCompare(b.id));
    expect(laudos.map((l) => l.id).sort()).toEqual([l1?.id, l3?.id].sort());
    const um = entrada.laudos.find((l) => l.id === l1?.id);
    expect(um).toMatchObject({
      clienteId: cliente?.id,
      diaLaudo: '2026-11-03',
      volume: 2,
      duplicado: true,
      assinado: true,
      tipificacao: { fatura: true },
      pecas: [{ modalidadeId: mod?.id, especialidadeId: esp?.id, categoriaId: null }],
    });
    expect(entrada.laudos.find((l) => l.id === l3?.id)).toMatchObject({
      assinado: false,
      tipificacao: null,
    });
    expect(entrada.clientes.get(cliente?.id as string)).toEqual({
      ativo: false,
      contratadoId: null,
    });
    expect(entrada.precosPorCliente.get(cliente?.id as string)?.[0]?.valor).toBe(63.5);
    expect(entrada.parametros).toEqual({
      cobraDuplicados: true,
      cobraClientesInativos: false,
      categoriaPadraoId: cat?.id,
      prioridadePadraoId: null,
    });
    expect([...entrada.alternativas]).toEqual([[pri?.id, alt?.id]]);
    expect(nomes.modalidades.get(mod?.id as string)).toBe(`M${s}`);
  });
});
