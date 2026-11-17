import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import { arranjoVazio } from '../../testing/fakes';
import { DrizzleArranjosRepository } from './drizzle-arranjos.repository';
import { DrizzleCadastrosDistribuicao } from './drizzle-cadastros-distribuicao';
import { DrizzleParametrosEquipeRepository } from './drizzle-parametros-equipe.repository';
import { DrizzleParametrosMedicoRepository } from './drizzle-parametros-medico.repository';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('repositórios da distribuição (banco)', () => {
  let pool: Pool;
  let db: Database;
  const ids: Record<string, string> = {};
  const id = (k: string) => ids[k] ?? '';
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
      sql`truncate table arranjos, medicos_distribuicao, frentes_escala, equipes, medicos,
        clientes, exames, modalidades, especialidades, subespecialidades, prioridades cascade`,
    );
    ids.ct = await primeiro(db.insert(schema.modalidades).values({ codigo: 'CT' }).returning());
    ids.rx = await primeiro(db.insert(schema.modalidades).values({ codigo: 'RX' }).returning());
    ids.neuro = await primeiro(
      db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning(),
    );
    ids.cranio = await primeiro(
      db.insert(schema.subespecialidades).values({ nome: 'CRÂNIO' }).returning(),
    );
    ids.rotina = await primeiro(
      db.insert(schema.prioridades).values({ nome: 'ROTINA' }).returning(),
    );
    ids.cli = await primeiro(
      db
        .insert(schema.clientes)
        .values({ nome: 'CLINICA X', chaveNormalizada: 'clinica x' })
        .returning(),
    );
    ids.exame = await primeiro(
      db
        .insert(schema.exames)
        .values({ nome: 'TC CRANIO', chaveNormalizada: 'tc cranio' })
        .returning(),
    );
    ids.medico = await primeiro(
      db
        .insert(schema.medicos)
        .values({ nome: 'Ana Souza', chaveNormalizada: 'ana souza' })
        .returning(),
    );
    ids.equipe = await primeiro(db.insert(schema.equipes).values({ nome: 'Equipe 2' }).returning());
    ids.frenteRx = await primeiro(
      db
        .insert(schema.frentesEscala)
        .values({ tipo: 'modalidade', modalidadeId: id('rx') })
        .returning(),
    );
  });

  it('grava e lê os arranjos do médico com todos os eixos, na ordem', async () => {
    const repo = new DrizzleArranjosRepository(db);
    const lista = [
      arranjoVazio({
        especialidadeId: id('neuro'),
        modalidadeIds: [id('ct')],
        subespecialidadeIds: [id('cranio')],
        subespecialidadeGeral: true,
        prioridadeIds: [id('rotina')],
        modoClientes: 'apenas',
        clienteIds: [id('cli')],
        modoExames: 'exceto',
        exameIds: [id('exame')],
        clientesExclusivosIds: [id('cli')],
      }),
      arranjoVazio({ modalidadeIds: [id('rx')] }),
    ];
    await repo.substituir({ tipo: 'medico', id: id('medico') }, lista);
    expect(await repo.listar({ tipo: 'medico', id: id('medico') })).toEqual(lista);
    expect(await repo.listar({ tipo: 'equipe', id: id('equipe') })).toEqual([]);
  });

  it('substituir troca a lista inteira e só a do dono', async () => {
    const repo = new DrizzleArranjosRepository(db);
    await repo.substituir({ tipo: 'equipe', id: id('equipe') }, [arranjoVazio()]);
    await repo.substituir({ tipo: 'medico', id: id('medico') }, [
      arranjoVazio({ modalidadeIds: [id('ct')] }),
    ]);
    await repo.substituir({ tipo: 'medico', id: id('medico') }, []);
    expect(await repo.listar({ tipo: 'medico', id: id('medico') })).toEqual([]);
    expect(await repo.listar({ tipo: 'equipe', id: id('equipe') })).toEqual([arranjoVazio()]);
  });

  it('parâmetros do médico: padrão sem linha, depois grava e atualiza', async () => {
    const repo = new DrizzleParametrosMedicoRepository(db);
    expect(await repo.obter(id('medico'))).toEqual({ habilitadoRobo: false });
    await repo.salvar(id('medico'), { habilitadoRobo: true });
    expect(await repo.obter(id('medico'))).toEqual({ habilitadoRobo: true });
    await repo.salvar(id('medico'), { habilitadoRobo: false });
    expect(await repo.obter(id('medico'))).toEqual({ habilitadoRobo: false });
  });

  it('uso da equipe: lê e grava o plantão da equipe; equipe inexistente dá null', async () => {
    const repo = new DrizzleParametrosEquipeRepository(db);
    expect(await repo.obter(id('equipe'))).toEqual({ plantao: false });
    await repo.salvar(id('equipe'), { plantao: true });
    expect(await repo.obter(id('equipe'))).toEqual({ plantao: true });
    expect(await repo.obter('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('cadastros: médico, equipe e frente', async () => {
    const cad = new DrizzleCadastrosDistribuicao(db);
    expect(await cad.medicoExiste(id('medico'))).toBe(true);
    expect(await cad.equipeExiste(id('medico'))).toBe(false);
    expect(await cad.frente(id('frenteRx'))).toEqual({
      tipo: 'modalidade',
      especialidadeId: null,
      modalidadeId: id('rx'),
    });
    expect(await cad.frente(id('medico'))).toBeNull();
    expect(await cad.rotulos({ clienteIds: [id('cli')], exameIds: [id('exame')] })).toEqual({
      clientes: [{ id: id('cli'), nome: 'CLINICA X' }],
      exames: [{ id: id('exame'), nome: 'TC CRANIO' }],
    });
    expect(await cad.rotulos({ clienteIds: [], exameIds: [] })).toEqual({
      clientes: [],
      exames: [],
    });
  });
});
