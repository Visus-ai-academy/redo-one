import { describe, expect, it } from 'vitest';

import type { LegadoCompetencia } from './legado';
import { mapearCompetencias } from './mapear-competencias';

const linha = (extra: Partial<LegadoCompetencia> = {}): LegadoCompetencia => ({
  competencia: '2026-10',
  status: 'aberto',
  dataFechamento: null,
  fechadoPor: null,
  observacoes: null,
  reabertoEm: null,
  reabertoPor: null,
  importacaoTravadaEm: null,
  importacaoTravadaPor: null,
  ...extra,
});

const usuarios = [{ id: 'u-fin', email: 'Financeiro2@teleimagem.com.br' }];

describe('mapearCompetencias', () => {
  it('aberto vira aberta, sem datas nem autores', () => {
    const { tabelas } = mapearCompetencias([linha({ competencia: '2026-11' })], { usuarios });

    expect(tabelas.competencias).toEqual([
      {
        competencia: '2026-11',
        status: 'aberta',
        fechadaEm: null,
        fechadaPorId: null,
        fechadaPorLegado: null,
        reabertaEm: null,
        reabertaPorId: null,
        reabertaPorLegado: null,
        importacaoTravadaEm: null,
        importacaoTravadaPorId: null,
        importacaoTravadaPorLegado: null,
        observacoes: null,
      },
    ]);
  });

  it('outubro fechado: datas como estão e o e-mail casa o usuário (sem diferenciar maiúsculas)', () => {
    const { tabelas, avisos } = mapearCompetencias(
      [
        linha({
          status: 'fechado',
          dataFechamento: '2026-11-10T23:34:33.000Z',
          fechadoPor: 'financeiro2@teleimagem.com.br',
          reabertoEm: '2026-11-10T20:37:00.000Z',
          observacoes: ' conferido ',
        }),
      ],
      { usuarios },
    );

    expect(tabelas.competencias[0]).toMatchObject({
      competencia: '2026-10',
      status: 'fechada',
      fechadaEm: new Date('2026-11-10T23:34:33.000Z'),
      fechadaPorId: 'u-fin',
      fechadaPorLegado: null,
      reabertaEm: new Date('2026-11-10T20:37:00.000Z'),
      reabertaPorId: null,
      reabertaPorLegado: null,
      observacoes: 'conferido',
    });
    expect(avisos).toEqual([]);
  });

  it('autor sem usuário (claude-code ou e-mail desconhecido) vai como texto', () => {
    const { tabelas } = mapearCompetencias(
      [
        linha({
          competencia: '2026-09',
          status: 'fechado',
          dataFechamento: '2026-10-05T12:00:00.000Z',
          fechadoPor: 'claude-code',
          reabertoPor: 'ex@teleimagem.com.br',
          importacaoTravadaEm: '2026-10-06T12:00:00.000Z',
          importacaoTravadaPor: 'financeiro2@teleimagem.com.br',
        }),
      ],
      { usuarios },
    );

    expect(tabelas.competencias[0]).toMatchObject({
      fechadaPorId: null,
      fechadaPorLegado: 'claude-code',
      reabertaPorId: null,
      reabertaPorLegado: 'ex@teleimagem.com.br',
      importacaoTravadaEm: new Date('2026-10-06T12:00:00.000Z'),
      importacaoTravadaPorId: 'u-fin',
      importacaoTravadaPorLegado: null,
    });
  });

  it('competência fora do formato AAAA-MM fica de fora com aviso', () => {
    const { tabelas, avisos } = mapearCompetencias([linha({ competencia: '10/2026' })], {
      usuarios,
    });

    expect(tabelas.competencias).toEqual([]);
    expect(avisos).toEqual([
      { tabela: 'competencias', item: '10/2026', motivo: expect.any(String) },
    ]);
  });
});
