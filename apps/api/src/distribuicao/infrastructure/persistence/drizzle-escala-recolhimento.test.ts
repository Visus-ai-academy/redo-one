import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '../../../database/database';
import * as schema from '../../../database/schema';
import type { ConsultaOcorrencias } from '../../../escala/ocorrencias/consulta-ocorrencias';
import { DrizzleEscalaRecolhimento } from './drizzle-escala-recolhimento';

// Roda contra um Postgres de verdade; sem TEST_DATABASE_URL, fica "skipped".
const url = process.env.TEST_DATABASE_URL;

/** 18/11/2026 é quarta-feira (3). */
const AGORA = new Date('2026-11-18T15:00:00-03:00');

describe.skipIf(!url)('DrizzleEscalaRecolhimento', () => {
  let pool: Pool;
  let db: Database;
  const pedidos: { de: string; ate: string }[] = [];
  /** A frente das ocorrências do fake, criada no `beforeAll`. */
  let frenteId = '';
  let modalidadeId = '';
  const ocorrencias = {
    listar: async (de: string, ate: string) => {
      pedidos.push({ de, ate });
      const o = {
        medicoId: 'm1',
        inicio: '2026-11-18T10:00:00.000Z',
        fim: '2026-11-18T16:00:00.000Z',
        turnoId: 't-lista',
        turnoTipo: 'lista',
        ausente: false,
        frenteId,
        subespecialidadeIds: ['seg-1'],
        subespecialidadeGeral: true,
      };
      // A de frente que não existe mais fica de fora.
      return { conflitos: [], ocorrencias: [o, { ...o, frenteId: crypto.randomUUID() }] };
    },
  } as unknown as ConsultaOcorrencias;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    db = drizzle({ client: pool, schema });
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });
    const [mod] = await db
      .insert(schema.modalidades)
      .values({ codigo: `RX-${Math.random().toString(36).slice(2)}` })
      .returning();
    modalidadeId = mod?.id ?? '';
    const [frente] = await db
      .insert(schema.frentesEscala)
      .values({ tipo: 'modalidade', modalidadeId })
      .returning();
    frenteId = frente?.id ?? '';
  });

  afterAll(async () => {
    await pool.end();
  });

  it('períodos: do dia de `desde` até hoje, com a frente e o recorte, no teto da janela', async () => {
    const escala = new DrizzleEscalaRecolhimento(db, ocorrencias);
    expect(await escala.periodos(new Date('2026-11-10T12:00:00-03:00'), AGORA)).toEqual([
      {
        medicoId: 'm1',
        inicio: new Date('2026-11-18T10:00:00.000Z'),
        fim: new Date('2026-11-18T16:00:00.000Z'),
        turnoId: 't-lista',
        lista: true,
        ausente: false,
        frente: { tipo: 'modalidade', especialidadeId: null, modalidadeId },
        subespecialidadeIds: ['seg-1'],
        subespecialidadeGeral: true,
      },
    ]);
    await escala.periodos(new Date('2020-01-01T12:00:00-03:00'), AGORA);
    expect(pedidos).toEqual([
      { de: '2026-11-10', ate: '2026-11-18' },
      { de: '2025-10-15', ate: '2026-11-18' },
    ]);
  });

  it('ausências: só a aprovada de dia inteiro que cobre hoje, com as frentes dela', async () => {
    const sufixo = Math.random().toString(36).slice(2);
    const [tipo] = await db
      .insert(schema.tiposAusencia)
      .values({ nome: `Férias ${sufixo}`, cor: '#00AA00' })
      .returning();
    const [esp] = await db
      .insert(schema.especialidades)
      .values({ nome: `NEURO ${sufixo}`, ordem: 99 })
      .returning();
    const [frente] = await db
      .insert(schema.frentesEscala)
      .values({ tipo: 'especialidade', especialidadeId: esp?.id ?? '' })
      .returning();
    const [turno] = await db
      .insert(schema.turnos)
      .values({ nome: `Manhã ${sufixo}`, horarioInicio: '07:00', horarioFim: '13:00', ordem: 99 })
      .returning();
    const medicos = await db
      .insert(schema.medicos)
      .values(
        ['toda', 'frente', 'pendente', 'turno', 'outro-dia', 'quarta', 'passada'].map((n) => ({
          nome: `${n} ${sufixo}`,
          chaveNormalizada: `${n} ${sufixo}`,
        })),
      )
      .returning();
    const id = (n: string) => medicos.find((m) => m.nome === `${n} ${sufixo}`)?.id ?? '';
    const base = {
      tipoId: tipo?.id ?? '',
      dataInicio: '2026-11-16',
      dataFim: '2026-11-20',
      situacao: 'aprovada' as const,
      todosDias: true,
      todasFrentes: true,
      todosTurnos: true,
    };
    const criadas = await db
      .insert(schema.ausencias)
      .values([
        { ...base, medicoId: id('toda') },
        { ...base, medicoId: id('frente'), todasFrentes: false },
        { ...base, medicoId: id('pendente'), situacao: 'pendente' },
        { ...base, medicoId: id('turno'), todosTurnos: false },
        { ...base, medicoId: id('outro-dia'), todosDias: false, diasSemana: [1, 2] },
        { ...base, medicoId: id('quarta'), todosDias: false, diasSemana: [3] },
        { ...base, medicoId: id('passada'), dataFim: '2026-11-17' },
      ])
      .returning();
    const daAusencia = (n: string) => criadas.find((a) => a.medicoId === id(n))?.id ?? '';
    await db
      .insert(schema.ausenciasFrentes)
      .values({ ausenciaId: daAusencia('frente'), frenteId: frente?.id ?? '' });
    await db
      .insert(schema.ausenciasTurnos)
      .values({ ausenciaId: daAusencia('turno'), turnoId: turno?.id ?? '' });

    const lidas = await new DrizzleEscalaRecolhimento(db, ocorrencias).ausenciasDoDia(AGORA);
    const minhas = lidas.filter((a) => medicos.some((m) => m.id === a.medicoId));
    expect(minhas).toHaveLength(3);
    expect(minhas).toEqual(
      expect.arrayContaining([
        { medicoId: id('toda'), todasFrentes: true, frentes: [] },
        {
          medicoId: id('frente'),
          todasFrentes: false,
          frentes: [{ tipo: 'especialidade', especialidadeId: esp?.id, modalidadeId: null }],
        },
        { medicoId: id('quarta'), todasFrentes: true, frentes: [] },
      ]),
    );
  });
});
