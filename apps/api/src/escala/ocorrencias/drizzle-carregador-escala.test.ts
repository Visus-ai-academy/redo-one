import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { ConsultaOcorrenciasEscala } from './consulta-ocorrencias';
import { DrizzleCarregadorEscala } from './drizzle-carregador-escala';
import { DrizzleMedicoDoUsuarioRepository } from './drizzle-medico-do-usuario.repository';

const url = process.env.TEST_DATABASE_URL;

// 16/11/2026 é segunda-feira.
describe.skipIf(!url)('carregador da escala (banco) + expansão', () => {
  let pool: Pool;
  let db: Database;
  let ids: Record<string, string>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../drizzle') });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table ajustes_produtividade, alocacoes_prioridades, alocacoes_subespecialidades,
        alocacoes, ausencias_frentes, ausencias_turnos, ausencias, tipos_ausencia, turnos_frentes,
        turnos, frentes_escala, especialidades, modalidades, prioridades_operacao, subespecialidades, usuarios, papeis,
        medicos cascade`,
    );
    const [manha] = await db
      .insert(schema.turnos)
      .values({ nome: 'Manhã', horarioInicio: '07:00', horarioFim: '13:00', cor: '#111111' })
      .returning();
    const [esp] = await db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning();
    const [neuro] = await db
      .insert(schema.frentesEscala)
      .values({ tipo: 'especialidade', especialidadeId: esp?.id ?? '' })
      .returning();
    const [ana, bruno, inativo] = await db
      .insert(schema.medicos)
      .values([
        { nome: 'Ana Souza', chaveNormalizada: 'ana souza' },
        { nome: 'Bruno Lima', chaveNormalizada: 'bruno lima' },
        { nome: 'Caio Inativo', chaveNormalizada: 'caio inativo', ativo: false },
      ])
      .returning();
    const [urgente] = await db
      .insert(schema.prioridadesOperacao)
      .values({ nome: 'URGENTE', posicao: 1, urgencia: 'sempre' })
      .returning();
    const [avc] = await db.insert(schema.subespecialidades).values({ nome: 'AVC' }).returning();
    const [ferias] = await db
      .insert(schema.tiposAusencia)
      .values({ nome: 'Férias', gravidade: 3, cor: '#333333' })
      .returning();
    ids = {
      manha: manha?.id ?? '',
      neuro: neuro?.id ?? '',
      ana: ana?.id ?? '',
      bruno: bruno?.id ?? '',
      inativo: inativo?.id ?? '',
      urgente: urgente?.id ?? '',
      avc: avc?.id ?? '',
      ferias: ferias?.id ?? '',
    };
  });

  const base = () => ({
    turnoId: ids.manha ?? '',
    frenteId: ids.neuro ?? '',
    diasSemana: [1, 2, 3, 4, 5],
    horarioInicio: '07:00',
    horarioFim: '13:00',
  });

  it('carrega titular, cobertura, ausência aprovada e ajuste; a expansão monta a semana', async () => {
    const [titular] = await db
      .insert(schema.alocacoes)
      .values({
        vigencia: 'fixa',
        ...base(),
        medicoId: ids.ana ?? '',
        dataInicio: '2026-01-01',
        produtividade: 20,
      })
      .returning();
    const titularId = titular?.id ?? '';
    await db
      .insert(schema.alocacoesPrioridades)
      .values({ alocacaoId: titularId, prioridadeId: ids.urgente ?? '' });
    await db
      .insert(schema.alocacoesSubespecialidades)
      .values({ alocacaoId: titularId, subespecialidadeId: ids.avc ?? '' });
    // Bruno cobre a terça.
    const [cobertura] = await db
      .insert(schema.alocacoes)
      .values({
        vigencia: 'periodo',
        ...base(),
        diasSemana: [2],
        medicoId: ids.bruno ?? '',
        dataInicio: '2026-11-17',
        dataFim: '2026-11-17',
        coberturaDeId: titularId,
        produtividade: 15,
      })
      .returning();
    // Ana de férias na quarta (aprovada) e pedido pendente na quinta (não tira da escala).
    const [aprovada] = await db
      .insert(schema.ausencias)
      .values({
        medicoId: ids.ana ?? '',
        tipoId: ids.ferias ?? '',
        dataInicio: '2026-11-18',
        dataFim: '2026-11-18',
      })
      .returning();
    await db
      .insert(schema.ausenciasFrentes)
      .values({ ausenciaId: aprovada?.id ?? '', frenteId: ids.neuro ?? '' });
    await db.insert(schema.ausencias).values({
      medicoId: ids.ana ?? '',
      tipoId: ids.ferias ?? '',
      dataInicio: '2026-11-19',
      dataFim: '2026-11-19',
      situacao: 'pendente',
      origem: 'medico',
    });
    // Sexta com produtividade ajustada; ajuste fora da janela não vem.
    await db.insert(schema.ajustesProdutividade).values([
      { alocacaoId: titularId, data: '2026-11-20', produtividade: 5 },
      { alocacaoId: titularId, data: '2026-12-01', produtividade: 9 },
    ]);
    // Fora da janela e de médico inativo.
    await db.insert(schema.alocacoes).values([
      { vigencia: 'fixa', ...base(), medicoId: ids.bruno ?? '', dataInicio: '2026-12-01' },
      { vigencia: 'fixa', ...base(), medicoId: ids.inativo ?? '', dataInicio: '2026-01-01' },
    ]);

    const carregador = new DrizzleCarregadorEscala(db);
    const dados = await carregador.carregar('2026-11-16', '2026-11-22');

    expect(dados.alocacoes).toHaveLength(3);
    expect(dados.alocacoes.find((a) => a.id === titularId)).toMatchObject({
      prioridadeIds: [ids.urgente],
      subespecialidadeIds: [ids.avc],
      dataInicio: '2026-01-01',
      dataFim: null,
      diasSemana: [1, 2, 3, 4, 5],
      semanasDoMes: [],
    });
    expect(dados.ausencias).toEqual([
      expect.objectContaining({ id: aprovada?.id, frenteIds: [ids.neuro], turnoIds: [] }),
    ]);
    expect(dados.ajustes).toEqual([
      { alocacaoId: titularId, data: '2026-11-20', produtividade: 5 },
    ]);
    expect(dados.medicos.map((m) => m.nome).sort()).toEqual([
      'Ana Souza',
      'Bruno Lima',
      'Caio Inativo',
    ]);

    const { ocorrencias } = await new ConsultaOcorrenciasEscala(carregador, {
      now: () => new Date('2026-11-16T12:00:00Z'),
    }).listar('2026-11-16', '2026-11-22');
    // No mesmo dia e horário, a ordem desempata por id (aleatório aqui): compara ordenado.
    const resumo = ocorrencias
      .map((o) => [
        o.data,
        o.medicoNome,
        o.ausente ? (o.tipoAusenciaNome ?? o.tipoAusenciaId) : 'presente',
        o.produtividade,
      ])
      .sort((x, y) => `${x[0]}${x[1]}`.localeCompare(`${y[0]}${y[1]}`));
    expect(resumo).toEqual([
      ['2026-11-16', 'Ana Souza', 'presente', 20],
      ['2026-11-17', 'Ana Souza', 'cobertura', 20],
      ['2026-11-17', 'Bruno Lima', 'presente', 15],
      ['2026-11-18', 'Ana Souza', 'Férias', 20],
      ['2026-11-19', 'Ana Souza', 'presente', 20],
      ['2026-11-20', 'Ana Souza', 'presente', 5],
    ]);
    const daCobertura = ocorrencias.find((o) => o.alocacaoId === cobertura?.id);
    expect(daCobertura).toMatchObject({
      prioridadeIds: [ids.urgente],
      subespecialidadeIds: [ids.avc],
      coberturaDe: { alocacaoId: titularId, medicoNome: 'Ana Souza' },
      turnoNome: 'Manhã',
      turnoCor: '#111111',
      frenteRotulo: 'NEURO',
    });
  });

  it('carrega a janela numa ida só ao banco (o banco remoto cobra a latência por consulta)', async () => {
    const [titular] = await db
      .insert(schema.alocacoes)
      .values({
        vigencia: 'periodo',
        ...base(),
        medicoId: ids.ana ?? '',
        dataInicio: '2026-01-01',
        dataFim: '2026-10-31',
      })
      .returning();
    await db.insert(schema.alocacoes).values({
      vigencia: 'fixa',
      ...base(),
      medicoId: ids.bruno ?? '',
      dataInicio: '2026-11-16',
      coberturaDeId: titular?.id ?? '',
    });
    const consultas = vi.spyOn(pool, 'query');

    const dados = await new DrizzleCarregadorEscala(db).carregar('2026-11-16', '2026-11-22');

    expect(consultas).toHaveBeenCalledTimes(1);
    consultas.mockRestore();
    expect(dados.alocacoes).toHaveLength(2);
    expect(dados.alocacoes.find((a) => a.id !== titular?.id)).toMatchObject({
      produtividade: null,
      dataFim: null,
      semanasDoMes: [],
      prioridadeIds: [],
      gratificado: false,
    });
    expect(dados.medicos.map((m) => m.nome).sort()).toEqual(['Ana Souza', 'Bruno Lima']);
    expect(dados.turnos).toEqual([
      expect.objectContaining({ nome: 'Manhã', cor: '#111111', ordem: 0, ativo: true }),
    ]);
    expect(dados.tiposAusencia).toEqual([
      { id: ids.ferias, nome: 'Férias', gravidade: 3, cor: '#333333' },
    ]);
    expect(dados.ausencias).toEqual([]);
    expect(dados.ajustes).toEqual([]);
  });

  it('janela vazia: listas vazias, não nulas', async () => {
    const dados = await new DrizzleCarregadorEscala(db).carregar('2026-11-16', '2026-11-22');

    expect(dados.alocacoes).toEqual([]);
    expect(dados.medicos).toEqual([]);
    expect(dados.ausencias).toEqual([]);
    expect(dados.ajustes).toEqual([]);
  });

  it('traz o titular de uma cobertura mesmo quando ele não toca a janela', async () => {
    const [titular] = await db
      .insert(schema.alocacoes)
      .values({
        vigencia: 'periodo',
        ...base(),
        medicoId: ids.ana ?? '',
        dataInicio: '2026-01-01',
        dataFim: '2026-10-31',
      })
      .returning();
    await db.insert(schema.alocacoes).values({
      vigencia: 'periodo',
      ...base(),
      medicoId: ids.bruno ?? '',
      dataInicio: '2026-11-16',
      dataFim: '2026-11-20',
      coberturaDeId: titular?.id ?? '',
    });

    const dados = await new DrizzleCarregadorEscala(db).carregar('2026-11-16', '2026-11-22');

    expect(dados.alocacoes.map((a) => a.id)).toContain(titular?.id);
  });

  it('frentes com nome, cor, ordem e ativo do catálogo: item inativo lá é frente inativa', async () => {
    const [ct] = await db
      .insert(schema.modalidades)
      .values({ codigo: 'CT', cor: '#222222', ordem: 4, ativo: false })
      .returning();
    const [frenteCt] = await db
      .insert(schema.frentesEscala)
      .values({ tipo: 'modalidade', modalidadeId: ct?.id ?? '' })
      .returning();

    const { frentes } = await new DrizzleCarregadorEscala(db).carregar('2026-11-16', '2026-11-22');

    expect(frentes).toEqual(
      expect.arrayContaining([
        { id: ids.neuro, rotulo: 'NEURO', ativo: true, cor: null, ordem: 0 },
        { id: frenteCt?.id, rotulo: 'CT', ativo: false, cor: '#222222', ordem: 4 },
      ]),
    );
  });

  it('acha o médico vinculado à conta', async () => {
    const [comMedico, semMedico] = await db
      .insert(schema.usuarios)
      .values([
        { nome: 'Ana', email: 'ana@x.com.br', medicoId: ids.ana },
        { nome: 'Gestor', email: 'gestor@x.com.br' },
      ])
      .returning();
    const repo = new DrizzleMedicoDoUsuarioRepository(db);

    expect(await repo.doUsuario(comMedico?.id ?? '')).toBe(ids.ana);
    expect(await repo.doUsuario(semMedico?.id ?? '')).toBeNull();
    expect(await repo.doUsuario('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
