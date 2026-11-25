import { resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../../database/database';
import * as schema from '../../database/schema';
import { ConflitoEscalaError } from '../domain';
import { DrizzleEscopoEscalaRepository } from '../escopo/drizzle-escopo.repository';
import { ConsultaOcorrenciasEscala } from '../ocorrencias/consulta-ocorrencias';
import { DrizzleCarregadorEscala } from '../ocorrencias/drizzle-carregador-escala';
import { AjustesProdutividadeService } from './ajustes.service';
import type { AlocacaoGravada } from './alocacoes.repository';
import { AlocacoesService } from './alocacoes.service';
import { DrizzleAlocacoesRepository } from './drizzle-alocacoes.repository';

const url = process.env.TEST_DATABASE_URL;
const relogio = { now: () => new Date('2026-11-16T12:00:00Z') };

describe.skipIf(!url)('repositório das alocações (banco)', () => {
  let pool: Pool;
  let db: Database;
  let ids: Record<string, string>;
  const id = (chave: string) => ids[chave] ?? '';

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
      sql`truncate table eventos_auditoria, ajustes_produtividade, alocacoes_prioridades,
        alocacoes_subespecialidades, alocacoes, turnos_frentes, turnos, frentes_escala,
        especialidades, prioridades_operacao, subespecialidades, usuarios, papeis, medicos cascade`,
    );
    const [manha] = await db
      .insert(schema.turnos)
      .values({ nome: 'Manhã', horarioInicio: '07:00', horarioFim: '13:00' })
      .returning();
    const [esp] = await db.insert(schema.especialidades).values({ nome: 'NEURO' }).returning();
    const [neuro] = await db
      .insert(schema.frentesEscala)
      .values({ tipo: 'especialidade', especialidadeId: esp?.id ?? '' })
      .returning();
    await db
      .insert(schema.turnosFrentes)
      .values({ turnoId: manha?.id ?? '', frenteId: neuro?.id ?? '' });
    const [ana, bruno] = await db
      .insert(schema.medicos)
      .values([
        { nome: 'Ana Souza', chaveNormalizada: 'ana souza' },
        { nome: 'Bruno Lima', chaveNormalizada: 'bruno lima' },
      ])
      .returning();
    const [urgente] = await db
      .insert(schema.prioridadesOperacao)
      .values({ nome: 'URGENTE', posicao: 1, urgencia: 'sempre' })
      .returning();
    const [avc] = await db.insert(schema.subespecialidades).values({ nome: 'AVC' }).returning();
    await db
      .insert(schema.subespecialidadesEspecialidades)
      .values({ subespecialidadeId: avc?.id ?? '', especialidadeId: esp?.id ?? '' });
    const [usuario] = await db
      .insert(schema.usuarios)
      .values({ nome: 'Gestora', email: 'gestora@x.com.br' })
      .returning();
    ids = {
      manha: manha?.id ?? '',
      neuro: neuro?.id ?? '',
      ana: ana?.id ?? '',
      bruno: bruno?.id ?? '',
      urgente: urgente?.id ?? '',
      avc: avc?.id ?? '',
      espNeuro: esp?.id ?? '',
      usuario: usuario?.id ?? '',
    };
  });

  const montar = () => {
    const repo = new DrizzleAlocacoesRepository(db);
    const escopos = new DrizzleEscopoEscalaRepository(db);
    const consulta = new ConsultaOcorrenciasEscala(new DrizzleCarregadorEscala(db), relogio);
    return {
      repo,
      alocacoes: new AlocacoesService(repo, escopos, consulta, relogio),
      ajustes: new AjustesProdutividadeService(repo, escopos, relogio),
    };
  };
  const ator = () => ({ usuarioId: id('usuario'), acessoTotal: true });

  it('lê o turno com as frentes, o médico e os recortes que existem', async () => {
    const { repo } = montar();
    expect(await repo.turno(id('manha'))).toEqual({
      id: id('manha'),
      nome: 'Manhã',
      tipo: 'fixo',
      horarioInicio: '07:00',
      horarioFim: '13:00',
      frenteIds: [id('neuro')],
    });
    expect(await repo.medico(id('ana'))).toEqual({ ativo: true });
    expect(await repo.prioridadesExistentes([id('urgente'), id('avc')])).toEqual([id('urgente')]);
    expect(await repo.segmentos([id('avc')])).toEqual([
      { id: id('avc'), nome: 'AVC', especialidadeIds: [id('espNeuro')] },
    ]);
    expect(await repo.especialidadeDaFrente(id('neuro'))).toBe(id('espNeuro'));
    expect(await repo.prioridadesExistentes([])).toEqual([]);
  });

  it('cria, lê, edita e remove em cascata, com auditoria na mesma transação', async () => {
    const { repo, alocacoes, ajustes } = montar();

    const criada = await alocacoes.criar(ator(), {
      medicoId: id('ana'),
      turnoId: id('manha'),
      frenteId: id('neuro'),
      vigencia: 'fixa',
      diasSemana: [1, 3, 5],
      dataInicio: '2026-11-01',
      produtividade: 20,
      prioridadeIds: [id('urgente')],
      subespecialidadeIds: [id('avc')],
    });
    expect(await repo.buscar(criada.id)).toEqual<AlocacaoGravada>({
      id: criada.id,
      medicoId: id('ana'),
      turnoId: id('manha'),
      frenteId: id('neuro'),
      vigencia: 'fixa',
      diasSemana: [1, 3, 5],
      semanasDoMes: [],
      horarioInicio: '07:00',
      horarioFim: '13:00',
      dataInicio: '2026-11-01',
      dataFim: null,
      produtividade: 20,
      gratificado: false,
      subespecialidadeGeral: false,
      prioridadeIds: [id('urgente')],
      subespecialidadeIds: [id('avc')],
      coberturaDeId: null,
      observacoes: null,
    });

    await alocacoes.atualizar(ator(), criada.id, {
      medicoId: id('ana'),
      turnoId: id('manha'),
      frenteId: id('neuro'),
      vigencia: 'fixa',
      diasSemana: [1, 3, 5],
      dataInicio: '2026-11-01',
      dataFim: '2026-12-31',
      produtividade: 22,
      prioridadeIds: [],
      subespecialidadeIds: [id('avc')],
    });
    // A fixa ganha fim e continua fixa.
    expect(await repo.buscar(criada.id)).toMatchObject({
      vigencia: 'fixa',
      dataFim: '2026-12-31',
      produtividade: 22,
      prioridadeIds: [],
    });

    const cobertura = await alocacoes.criarCobertura(ator(), criada.id, {
      medicoId: id('bruno'),
      dataInicio: '2026-11-16',
      dataFim: '2026-11-20',
    });
    expect(await repo.coberturasDe(criada.id)).toEqual([
      expect.objectContaining({
        id: cobertura.id,
        coberturaDeId: criada.id,
        vigencia: 'periodo',
        diasSemana: [1, 3, 5],
      }),
    ]);

    await ajustes.definir(ator(), cobertura.id, '2026-11-18', { produtividade: 4 });
    await ajustes.definir(ator(), cobertura.id, '2026-11-18', { produtividade: 6 });
    expect(await repo.ajuste(cobertura.id, '2026-11-18')).toMatchObject({ produtividade: 6 });
    expect(await repo.ajustesDe([criada.id, cobertura.id])).toHaveLength(1);

    await alocacoes.remover(ator(), criada.id);

    expect(await repo.buscar(criada.id)).toBeNull();
    expect(await repo.buscar(cobertura.id)).toBeNull();
    expect(await repo.ajustesDe([cobertura.id])).toEqual([]);
    const eventos = await db
      .select()
      .from(schema.eventosAuditoria)
      .orderBy(schema.eventosAuditoria.ocorridoEm, schema.eventosAuditoria.id);
    const resumo = eventos.map((e) => `${e.entidade}:${e.acao}`).sort();
    expect(resumo).toEqual(
      [
        'alocacao:criado',
        'alocacao:alterado',
        'alocacao:criado',
        'ajuste_produtividade:criado',
        'ajuste_produtividade:alterado',
        'alocacao:excluido',
        'alocacao:excluido',
        'ajuste_produtividade:excluido',
      ].sort(),
    );
    const remocaoCobertura = eventos.find(
      (e) => e.entidadeId === cobertura.id && e.acao === 'excluido',
    );
    expect(remocaoCobertura).toMatchObject({
      atorTipo: 'usuario',
      atorId: id('usuario'),
      depois: null,
      antes: expect.objectContaining({
        medicoId: id('bruno'),
        turnoId: id('manha'),
        frenteId: id('neuro'),
      }),
    });
  });

  it('remover o ajuste do dia apaga a linha e registra o evento', async () => {
    const { repo, alocacoes, ajustes } = montar();
    const { id: alocacaoId } = await alocacoes.criar(ator(), {
      medicoId: id('ana'),
      turnoId: id('manha'),
      frenteId: id('neuro'),
      vigencia: 'fixa',
      diasSemana: [1],
      dataInicio: '2026-11-01',
    });
    await ajustes.definir(ator(), alocacaoId, '2026-11-16', { produtividade: 3 });
    const ajuste = await repo.ajuste(alocacaoId, '2026-11-16');

    await ajustes.definir(ator(), alocacaoId, '2026-11-16', { produtividade: null });

    expect(await repo.ajuste(alocacaoId, '2026-11-16')).toBeNull();
    const [evento] = await db
      .select()
      .from(schema.eventosAuditoria)
      .where(eq(schema.eventosAuditoria.acao, 'excluido'));
    expect(evento).toMatchObject({ entidade: 'ajuste_produtividade', entidadeId: ajuste?.id });
  });

  const titular = async () =>
    (
      await montar().alocacoes.criar(ator(), {
        medicoId: id('ana'),
        turnoId: id('manha'),
        frenteId: id('neuro'),
        vigencia: 'fixa',
        diasSemana: [1, 3, 5],
        dataInicio: '2026-11-01',
      })
    ).id;

  it('duas coberturas sobrepostas ao mesmo tempo: só uma entra', async () => {
    const titularId = await titular();
    const cobrir = (dataInicio: string) =>
      montar().alocacoes.criarCobertura(ator(), titularId, {
        medicoId: id('bruno'),
        dataInicio,
        dataFim: '2026-11-20',
      });

    for (let rodada = 0; rodada < 5; rodada++) {
      await db.delete(schema.alocacoes).where(eq(schema.alocacoes.coberturaDeId, titularId));
      const resultados = await Promise.allSettled([cobrir('2026-11-16'), cobrir('2026-11-18')]);

      expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      const recusa = resultados.find((r) => r.status === 'rejected');
      expect((recusa as PromiseRejectedResult).reason).toBeInstanceOf(ConflitoEscalaError);
      expect(await montar().repo.coberturasDe(titularId)).toHaveLength(1);
    }
  });

  it('cobertura de titular que sumiu antes da gravação é recusada', async () => {
    const { repo } = montar();
    const titularId = await titular();
    const atual = await repo.buscar(titularId);
    await db.delete(schema.alocacoes).where(eq(schema.alocacoes.id, titularId));

    await expect(
      repo.criarCobertura(
        { ...(atual as AlocacaoGravada), id: crypto.randomUUID(), coberturaDeId: titularId },
        [],
        () => {},
      ),
    ).rejects.toThrow(/não existe mais/);
  });

  it('remover lê na transação o que cai em cascata: cada registro apagado tem evento', async () => {
    const { repo } = montar();
    const titularId = await titular();
    // Gravados por fora do serviço (outra sessão), depois de qualquer leitura prévia.
    const [cob] = await db
      .insert(schema.alocacoes)
      .values({
        vigencia: 'periodo',
        medicoId: id('bruno'),
        turnoId: id('manha'),
        frenteId: id('neuro'),
        diasSemana: [1],
        horarioInicio: '07:00',
        horarioFim: '13:00',
        dataInicio: '2026-11-16',
        dataFim: '2026-11-16',
        coberturaDeId: titularId,
      })
      .returning();
    const [aj] = await db
      .insert(schema.ajustesProdutividade)
      .values({ alocacaoId: cob?.id ?? '', data: '2026-11-16', produtividade: 2 })
      .returning();

    await montar().alocacoes.remover(ator(), titularId);

    expect(await repo.buscar(cob?.id ?? '')).toBeNull();
    const excluidos = await db
      .select({ entidadeId: schema.eventosAuditoria.entidadeId })
      .from(schema.eventosAuditoria)
      .where(eq(schema.eventosAuditoria.acao, 'excluido'));
    expect(excluidos.map((e) => e.entidadeId).sort()).toEqual([titularId, cob?.id, aj?.id].sort());
  });

  it('remover e cobrir ao mesmo tempo: nada some sem evento', async () => {
    for (let rodada = 0; rodada < 5; rodada++) {
      await db.execute(sql`truncate table eventos_auditoria, alocacoes cascade`);
      const titularId = await titular();

      await Promise.allSettled([
        montar().alocacoes.criarCobertura(ator(), titularId, {
          medicoId: id('bruno'),
          dataInicio: '2026-11-16',
          dataFim: '2026-11-20',
        }),
        montar().alocacoes.remover(ator(), titularId),
      ]);

      const restantes = await db.select({ id: schema.alocacoes.id }).from(schema.alocacoes);
      expect(restantes).toEqual([]);
      const eventos = await db.select().from(schema.eventosAuditoria);
      const criados = eventos.filter((e) => e.acao === 'criado').map((e) => e.entidadeId);
      const excluidos = eventos.filter((e) => e.acao === 'excluido').map((e) => e.entidadeId);
      expect(excluidos.sort()).toEqual(criados.sort());
    }
  });
});
