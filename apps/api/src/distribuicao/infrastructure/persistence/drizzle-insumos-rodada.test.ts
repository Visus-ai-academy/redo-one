import { resolve } from 'node:path';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { normalizarNome } from '../../../catalogo/comum/nomes';
import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { ConsultaOcorrencias } from '../../../escala/ocorrencias/consulta-ocorrencias';
import { DrizzleArranjosRepository } from './drizzle-arranjos.repository';
import { DrizzleInsumosRodada } from './drizzle-insumos-rodada';
import { DrizzleMedicosRodada } from './drizzle-medicos-rodada';

const url = process.env.TEST_DATABASE_URL;
const agora = new Date('2026-11-18T12:00:00Z');
const semEscala: ConsultaOcorrencias = { listar: async () => ({ ocorrencias: [], conflitos: [] }) };

describe.skipIf(!url)('insumos da rodada (banco)', () => {
  let pool: Pool;
  let db: Database;
  const ids: Record<string, string> = {};
  const primeiro = async (p: Promise<{ id: string }[]>) => (await p)[0]?.id ?? '';

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table rodadas, arranjos, medicos_distribuicao, equipes, medicos, exames, clientes,
        modalidades, especialidades, subespecialidades, prioridades, configuracao_distribuicao cascade`,
    );
    ids.mi = await primeiro(
      db.insert(schema.especialidades).values({ nome: 'MEDICINA INTERNA' }).returning(),
    );
    ids.ct = await primeiro(db.insert(schema.modalidades).values({ codigo: 'CT' }).returning());
    ids.exame = await primeiro(
      db
        .insert(schema.exames)
        .values({
          nome: 'TC TORAX',
          chaveNormalizada: normalizarNome('TC TORAX'),
          modalidadeId: ids.ct,
          especialidadeId: ids.mi,
        })
        .returning(),
    );
    ids.cliente = await primeiro(
      db
        .insert(schema.clientes)
        .values({ nome: 'HOSPITAL A', chaveNormalizada: normalizarNome('HOSPITAL A') })
        .returning(),
    );
    ids.rotina = await primeiro(
      db.insert(schema.prioridades).values({ nome: 'ROTINA' }).returning(),
    );
    const medico = (nome: string, idMobilemed: number | null, ativo = true) =>
      primeiro(
        db
          .insert(schema.medicos)
          .values({ nome, chaveNormalizada: normalizarNome(nome), idMobilemed, ativo })
          .returning(),
      );
    ids.ana = await medico('Ana', 101);
    ids.beto = await medico('Beto', 102);
    ids.caio = await medico('Caio', 103, false);
    await db.insert(schema.medicosContasMobilemed).values({ medicoId: ids.ana, idMobilemed: 201 });
    await db.insert(schema.medicosDistribuicao).values([
      { medicoId: ids.ana, habilitadoRobo: true },
      { medicoId: ids.beto, habilitadoRobo: false },
      { medicoId: ids.caio, habilitadoRobo: true },
    ]);
    await new DrizzleArranjosRepository(db).substituir({ tipo: 'medico', id: ids.ana }, [
      {
        especialidadeId: ids.mi,
        modalidadeId: null,
        todasEspecialidades: false,
        especialidadeIds: [],
        todasModalidades: false,
        modalidadeIds: [ids.ct],
        todosSegmentos: true,
        subespecialidadeIds: [],
        subespecialidadeGeral: false,
        todasPrioridades: true,
        prioridadeIds: [],
        modoClientes: 'todos',
        clienteIds: [],
        modoExames: 'todos',
        exameIds: [],
        clientesExclusivosIds: [ids.cliente],
      },
    ]);
  });

  it('só os médicos ativos e habilitados, com os arranjos', async () => {
    const { insumos } = await new DrizzleInsumosRodada(db, semEscala).carregar(agora);
    expect(insumos.medicos).toEqual([
      expect.objectContaining({ id: ids.ana, idMobilemed: 101, outrasContas: [201] }),
    ]);
    expect(insumos.medicos[0]?.arranjos[0]).toMatchObject({
      especialidadeId: ids.mi,
      modalidadeIds: [ids.ct],
      clientesExclusivosIds: [ids.cliente],
    });
    expect(insumos.config.roboAtivo).toBe(true);
    expect(insumos.nomes[ids.mi ?? '']).toBe('MEDICINA INTERNA');
  });

  it('cores das listas e os segmentos de cada especialidade, para a tela', async () => {
    await db.update(schema.especialidades).set({ cor: '#7A5AB5' });
    const seg = await primeiro(
      db.insert(schema.subespecialidades).values({ nome: 'TORAX', cor: '#3E8E5E' }).returning(),
    );
    await db
      .insert(schema.subespecialidadesEspecialidades)
      .values({ subespecialidadeId: seg ?? '', especialidadeId: ids.mi ?? '' });
    const { insumos } = await new DrizzleInsumosRodada(db, semEscala).carregar(agora);
    expect(insumos.cores?.[ids.mi ?? '']).toBe('#7A5AB5');
    expect(insumos.cores?.[ids.ct ?? '']).toBeNull();
    expect(insumos.cores?.[seg ?? '']).toBe('#3E8E5E');
    expect(insumos.segmentos?.[ids.mi ?? '']).toEqual([seg]);
  });

  it('casa o texto da MobileMed com o catálogo pelas regras da ingestão', async () => {
    const { catalogo } = await new DrizzleInsumosRodada(db, semEscala).carregar(agora);
    expect(
      catalogo.classificar({ estudo: 'TC TORAX X1', modalidade: 'CT', especialidade: null }),
    ).toMatchObject({
      exameId: ids.exame,
      especialidadeId: ids.mi,
      modalidadeId: ids.ct,
    });
    expect(catalogo.cliente('HOSPITAL A')).toBe(ids.cliente);
    expect(catalogo.cliente('OUTRA')).toBeNull();
    expect(catalogo.traduzirPrioridade('Rotina')).toBe(ids.rotina);
  });

  it('os clientes inativos do cadastro, que a rodada não distribui (e o nome para o alerta)', async () => {
    const inativo = await primeiro(
      db
        .insert(schema.clientes)
        .values({ nome: 'CLINICA FECHADA', chaveNormalizada: 'CLINICA FECHADA', ativo: false })
        .returning(),
    );
    const { insumos, catalogo } = await new DrizzleInsumosRodada(db, semEscala).carregar(agora);
    expect(insumos.clientesInativos).toEqual([inativo]);
    expect(insumos.nomes[inativo]).toBe('CLINICA FECHADA');
    // O inativo continua casando pelo nome: é assim que a rodada sabe de quem é o exame.
    expect(catalogo.cliente('CLINICA FECHADA')).toBe(inativo);
  });

  it('médicos da rodada: habilitados e o cadastro na hora', async () => {
    const m = new DrizzleMedicosRodada(db);
    expect(await m.habilitados()).toBe(1);
    const cadastro = await m.doCadastro([ids.ana ?? '', ids.caio ?? '']);
    expect(cadastro.get(ids.ana ?? '')).toMatchObject({
      ativo: true,
      idMobilemed: 101,
      habilitadoRobo: true,
      outrasContas: [201],
    });
    expect(cadastro.get(ids.caio ?? '')?.ativo).toBe(false);
  });
});
