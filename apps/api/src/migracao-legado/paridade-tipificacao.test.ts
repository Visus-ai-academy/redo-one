import { describe, expect, it } from 'vitest';

import { compararTipificacoes, type LaudoLegadoTipificado } from './paridade-tipificacao';

const legado = (identidade: string, regra: string | null, sub: string | null) =>
  [
    identidade,
    { regra, sub, especialidade: 'COLUNAS', prioridade: 'Rotina', medico: 'Dr. A' },
  ] as const;

describe('compararTipificacoes', () => {
  it('conta iguais, sem par e divergentes, e agrupa as divergências pelo motivo aparente', () => {
    const antigos = new Map<string, LaudoLegadoTipificado>([
      legado('a', 'CO', null),
      legado('b', 'NC', 'NC-FT'),
      legado('c', 'NC', 'NC-FT'),
    ]);
    const r = compararTipificacoes(
      [
        {
          identidade: 'a',
          regra: 'CO',
          sub: null,
          cliente: 'X',
          especialidade: 'MSK',
          prioridade: 'ROTINA',
          medico: 'A',
          volume: 1,
        },
        {
          identidade: 'b',
          regra: 'NC',
          sub: 'NC-NF',
          cliente: 'R',
          especialidade: 'MSK',
          prioridade: 'ROTINA',
          medico: 'A',
          volume: 2,
        },
        {
          identidade: 'c',
          regra: 'NC',
          sub: 'NC-NF',
          cliente: 'R',
          especialidade: 'MSK',
          prioridade: 'ROTINA',
          medico: 'A',
          volume: 1,
        },
        {
          identidade: 'd',
          regra: 'CO',
          sub: null,
          cliente: 'X',
          especialidade: 'MSK',
          prioridade: 'ROTINA',
          medico: 'A',
          volume: 1,
        },
      ],
      antigos,
    );
    expect(r).toMatchObject({ total: 4, iguais: 1, semPar: 1, divergentes: 2 });
    expect(r.grupos).toEqual([
      {
        cliente: 'R',
        legado: 'NC-FT',
        redo: 'NC-NF',
        especialidade: 'COLUNAS → MSK',
        prioridade: 'Rotina → ROTINA',
        laudos: 2,
        volume: 3,
      },
    ]);
  });
});
