import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { FrenteEscala } from '../../domain/arranjo';
import { CONFIGURACAO_INICIAL } from '../../domain/configuracao-global';
import { REGRAS_NEUTRAS, type RegrasFrente } from '../../domain/motor/configuracao';
import { EscalaDoAjusteAdapter } from '../escala/escala-do-ajuste.adapter';
import { DrizzleAjustesDiaRepository } from './drizzle-ajustes-dia.repository';
import { DrizzleCadastrosDistribuicao } from './drizzle-cadastros-distribuicao';
import { DrizzleConfiguracaoDistribuicaoRepository } from './drizzle-configuracao-distribuicao.repository';
import { DrizzlePrioridadesClienteRepository } from './drizzle-prioridades-cliente.repository';
import { DrizzleRegrasFrenteRepository } from './drizzle-regras-frente.repository';

const url = process.env.TEST_DATABASE_URL;
const NENHUM = '00000000-0000-0000-0000-000000000000';

describe.skipIf(!url)('configuração do robô (banco)', () => {
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
      sql`truncate table ajustes_dia_distribuicao, alocacoes, frentes_escala, usuarios, papeis, medicos, prioridades_cliente, regras_frente, configuracao_distribuicao, configuracao_distribuicao_urgentes,
        configuracao_distribuicao_lista_prioridades, configuracao_distribuicao_turnos_posteriores,
        turnos, clientes, modalidades, especialidades, subespecialidades, prioridades cascade`,
    );
    ids.urg = await primeiro(
      db.insert(schema.prioridades).values({ nome: 'URGÊNCIA' }).returning(),
    );
    ids.rot = await primeiro(db.insert(schema.prioridades).values({ nome: 'ROTINA' }).returning());
    ids.ct = await primeiro(db.insert(schema.modalidades).values({ codigo: 'CT' }).returning());
    ids.mr = await primeiro(db.insert(schema.modalidades).values({ codigo: 'MR' }).returning());
    ids.neuro = await primeiro(
      db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning(),
    );
    ids.cp = await primeiro(
      db.insert(schema.subespecialidades).values({ nome: 'CABEÇA E PESCOÇO' }).returning(),
    );
    ids.cli = await primeiro(
      db
        .insert(schema.clientes)
        .values({ nome: 'CLINICA X', chaveNormalizada: 'clinica x' })
        .returning(),
    );
    ids.tarde = await primeiro(
      db
        .insert(schema.turnos)
        .values({ nome: 'Tarde', horarioInicio: '13:00', horarioFim: '19:00' })
        .returning(),
    );
  });

  it('configuração global: sem linha é null; grava, lê e troca as listas', async () => {
    const repo = new DrizzleConfiguracaoDistribuicaoRepository(db);
    expect(await repo.obter()).toBeNull();
    const producao = {
      ...CONFIGURACAO_INICIAL,
      prioridadeIdsUrgentes: [id('urg')],
      marcadoresEquilibrio: ['ONCO'],
      turnosPosteriores: { turnoIds: [id('tarde')], cheiaEm: '10:50' },
      lista: { prioridadeIds: [id('rot')], prazoMinimoHoras: 24 },
    };
    await repo.salvar(producao);
    expect(await repo.obter()).toEqual(producao);

    const semPosteriores = {
      ...producao,
      prioridadeIdsUrgentes: [],
      turnosPosteriores: null,
      lista: { prioridadeIds: [], prazoMinimoHoras: null },
      recolhimentoAposTurnoMin: null,
    };
    await repo.salvar(semPosteriores);
    expect(await repo.obter()).toEqual(semPosteriores);
  });

  it('cadastros: diz quais tipos têm id que não existe', async () => {
    const cad = new DrizzleCadastrosDistribuicao(db);
    expect(
      await cad.faltando({
        prioridade: [id('urg'), id('rot'), id('urg')],
        turno: [id('tarde')],
        especialidade: [id('neuro')],
        modalidade: [id('ct')],
        subespecialidade: [id('cp')],
        cliente: [id('cli')],
      }),
    ).toEqual([]);
    expect(
      await cad.faltando({ prioridade: [id('urg'), NENHUM], turno: [], cliente: [NENHUM] }),
    ).toEqual(['prioridade', 'cliente']);
  });

  it('regras da frente: grava tudo, lê igual, troca inteiro e separa especialidade de modalidade', async () => {
    const repo = new DrizzleRegrasFrenteRepository(db);
    const neuro: FrenteEscala = {
      tipo: 'especialidade',
      especialidadeId: id('neuro'),
      modalidadeId: null,
    };
    const ct: FrenteEscala = { tipo: 'modalidade', especialidadeId: null, modalidadeId: id('ct') };
    expect(await repo.obter(neuro)).toBeNull();

    const cheia: RegrasFrente = {
      frente: neuro,
      listaPrioridadeIds: [id('rot')],
      listaPrazoMinimoHoras: null,
      recolheAoFimDoTurno: false,
      distribuiPeloRobo: true,
      horariosSemRobo: [{ diasSemana: [1, 5], inicio: '19:00', fim: '07:00' }],
      divisao: {
        metodo: 'proporcao',
        proporcoes: [
          { modalidadeId: id('ct'), percentual: 40 },
          { modalidadeId: id('mr'), percentual: 60 },
        ].sort((a, b) => (a.modalidadeId < b.modalidadeId ? -1 : 1)),
      },
      tetoPorMedico: 30,
      segmentos: [
        {
          subespecialidadeId: id('cp'),
          teto: 7,
          tetoReduzido: { produtividadeAte: 15, teto: 4 },
          piso: null,
          pacoteAParte: false,
        },
      ],
      mistura: [
        { especialidadeId: null, subespecialidadeId: id('cp') },
        { especialidadeId: id('neuro'), subespecialidadeId: null },
      ],
      listaDepoisDosFixos: true,
    };
    await repo.salvar(cheia);
    expect(await repo.obter(neuro)).toEqual(cheia);

    // Os campos da Lista ausentes = seguem o padrão; troca inteira some com as filhas.
    const neutra = { frente: neuro, ...REGRAS_NEUTRAS };
    await repo.salvar(neutra);
    expect(await repo.obter(neuro)).toEqual(neutra);

    const plantao = {
      ...REGRAS_NEUTRAS,
      frente: ct,
      listaPrazoMinimoHoras: 12,
      horariosSemRobo: [{ diasSemana: [], inicio: '19:00', fim: '07:00' }],
    };
    await repo.salvar(plantao);
    expect(await repo.obter(ct)).toEqual(plantao);
    expect(await repo.listar()).toEqual([neutra, plantao]);
  });

  it('prioridade do cliente: troca a lista do cliente e lê no formato do motor', async () => {
    const repo = new DrizzlePrioridadesClienteRepository(db);
    const neuro: FrenteEscala = {
      tipo: 'especialidade',
      especialidadeId: id('neuro'),
      modalidadeId: null,
    };
    const ct: FrenteEscala = { tipo: 'modalidade', especialidadeId: null, modalidadeId: id('ct') };
    expect(await repo.doCliente(id('cli'))).toEqual([]);
    await repo.substituir(id('cli'), [
      { frente: ct, nivel: 2 },
      { frente: neuro, nivel: 1 },
    ]);
    expect(await repo.doCliente(id('cli'))).toEqual([
      { frente: neuro, nivel: 1 },
      { frente: ct, nivel: 2 },
    ]);
    expect(await repo.todas()).toHaveLength(2);
    await repo.substituir(id('cli'), [{ frente: ct, nivel: 1 }]);
    expect(await repo.todas()).toEqual([{ clienteId: id('cli'), frente: ct, nivel: 1 }]);
  });

  it('ajuste do dia: grava, troca pelas mesmas alocação e data, lista, remove; adaptador da escala', async () => {
    const medico = await primeiro(
      db.insert(schema.medicos).values({ nome: 'Ana', chaveNormalizada: 'ana' }).returning(),
    );
    const frente = await primeiro(
      db
        .insert(schema.frentesEscala)
        .values({ tipo: 'especialidade', especialidadeId: id('neuro') })
        .returning(),
    );
    const outraFrente = await primeiro(
      db
        .insert(schema.frentesEscala)
        .values({ tipo: 'modalidade', modalidadeId: id('ct') })
        .returning(),
    );
    // 2026-11-18 é quarta (3).
    const alocacao = await primeiro(
      db
        .insert(schema.alocacoes)
        .values({
          medicoId: medico,
          turnoId: id('tarde'),
          frenteId: frente,
          diasSemana: [3],
          horarioInicio: '13:00',
          horarioFim: '19:00',
          dataInicio: '2026-11-01',
        })
        .returning(),
    );
    const repo = new DrizzleAjustesDiaRepository(db);
    expect(await repo.obter(alocacao, '2026-11-18')).toBeNull();
    const base = {
      id: '11111111-1111-4111-8111-111111111111',
      alocacaoId: alocacao,
      data: '2026-11-18',
      prioridadeIdsLiberadas: [id('urg')],
      listaSegueSla: false,
      clienteId: null,
    };
    await repo.salvar(base);
    await repo.salvar({
      ...base,
      prioridadeIdsLiberadas: [id('rot'), id('urg')].sort(),
      listaSegueSla: true,
      clienteId: id('cli'),
    });
    const lido = await repo.obter(alocacao, '2026-11-18');
    expect(lido).toEqual({
      ...base,
      prioridadeIdsLiberadas: [id('rot'), id('urg')].sort(),
      listaSegueSla: true,
      clienteId: id('cli'),
      clienteNome: 'CLINICA X',
      medicoId: medico,
      turnoId: id('tarde'),
      frenteId: frente,
    });
    expect(await repo.listar({ de: '2026-11-01', ate: '2026-11-30' })).toHaveLength(1);
    expect(await repo.listar({ de: '2026-11-01', ate: '2026-11-30', medicoId: NENHUM })).toEqual(
      [],
    );
    expect(await repo.listar({ de: '2026-11-19', ate: '2026-11-30' })).toEqual([]);
    await repo.remover(base.id);
    expect(await repo.obter(alocacao, '2026-11-18')).toBeNull();

    const escala = new EscalaDoAjusteAdapter(db);
    const admin = { usuarioId: NENHUM, acessoTotal: true };
    expect(await escala.alocacaoNoRecorte(admin, alocacao)).toEqual({
      id: alocacao,
      medicoId: medico,
      turnoId: id('tarde'),
      frenteId: frente,
    });
    expect(await escala.ehDiaDePlantao(alocacao, '2026-11-18')).toBe(true);
    expect(await escala.ehDiaDePlantao(alocacao, '2026-11-19')).toBe(false);
    const papel = await primeiro(db.insert(schema.papeis).values({ nome: 'Gestora' }).returning());
    const gestora = await primeiro(
      db
        .insert(schema.usuarios)
        .values({ nome: 'G', email: 'g@x.com', papelId: papel })
        .returning(),
    );
    await db
      .insert(schema.usuariosEscoposEscala)
      .values({ usuarioId: gestora, frenteId: outraFrente });
    const ator = { usuarioId: gestora, acessoTotal: false };
    expect(await escala.alocacaoNoRecorte(ator, alocacao)).toBeNull();
    const noRecorte = await escala.recorteDo(ator);
    expect(noRecorte({ turnoId: id('tarde'), frenteId: outraFrente })).toBe(true);
    expect(noRecorte({ turnoId: id('tarde'), frenteId: frente })).toBe(false);
  });
});
