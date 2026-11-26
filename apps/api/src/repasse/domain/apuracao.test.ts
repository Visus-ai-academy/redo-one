import { describe, expect, it } from 'vitest';

import { calcularExtras, type RegraApuracaoVigente, tarifasDasRegras } from './apuracao';
import type { LaudoRepasse } from './demonstrativo';

let seq = 0;
const laudo = (p: Partial<LaudoRepasse> = {}): LaudoRepasse => ({
  laudoId: `l-${++seq}`,
  peca: 0,
  medicoId: 'ana',
  clienteId: 'cli',
  unidadeId: null,
  modalidadeId: 'mr',
  especialidadeId: 'mi',
  categoriaId: 'sc',
  prioridadeId: 'rotina',
  volume: 1,
  dia: '2026-10-01',
  duplicado: false,
  ...p,
});
const regra = (p: Partial<RegraApuracaoVigente>): RegraApuracaoVigente => ({
  id: `r-${++seq}`,
  medicoId: 'coord',
  tipo: 'fixo',
  descricao: 'Coordenação',
  valorCentavos: 300000,
  percentualPpm: null,
  divisor: 1,
  modalidadeIds: null,
  especialidadeIds: null,
  prioridadeIds: null,
  ...p,
});
const vazio = { laudos: [], especialidadesDoMedico: new Map(), examesPorMedico: new Map() };

describe('calcularExtras', () => {
  it('fixo: o valor da competência, dividido pelo divisor', () => {
    const r = regra({ divisor: 2 });
    const extras = calcularExtras({ ...vazio, regras: [r] });
    expect(extras.get('coord')).toEqual([
      { regraId: r.id, valorCentavos: 150000, descricao: 'Coordenação (R$ 3.000,00 ÷ 2)' },
    ]);
  });

  it('por laudo: soma o volume dos laudos da operação inteira que casam os recortes', () => {
    const r = regra({
      tipo: 'por_laudo',
      valorCentavos: 30,
      divisor: 2,
      modalidadeIds: ['mr', 'ct'],
      prioridadeIds: ['plantao'],
      descricao: 'Variável plantão',
    });
    const laudos = [
      laudo({ prioridadeId: 'plantao', volume: 3 }),
      laudo({ prioridadeId: 'plantao', medicoId: 'bia', modalidadeId: 'ct' }),
      laudo({ prioridadeId: 'plantao', medicoId: null }),
      laudo({ prioridadeId: 'rotina' }),
      laudo({ prioridadeId: 'plantao', modalidadeId: 'rx' }),
    ];
    const extras = calcularExtras({ ...vazio, laudos, regras: [r] });
    // 5 laudos × R$ 0,30 ÷ 2 = R$ 0,75
    expect(extras.get('coord')?.[0]).toMatchObject({
      valorCentavos: 75,
      descricao: 'Variável plantão (5 laudos × R$ 0,30 ÷ 2)',
    });
  });

  it('percentual: sobre o valor de exames dos médicos que laudam a especialidade, inclusive o coordenador', () => {
    const r = regra({
      tipo: 'percentual_repasse',
      valorCentavos: null,
      percentualPpm: 60000,
      especialidadeIds: ['cardio'],
      descricao: 'Coordenação Cardiologia',
    });
    const extras = calcularExtras({
      ...vazio,
      regras: [r],
      especialidadesDoMedico: new Map([
        ['coord', new Set(['cardio'])],
        ['bia', new Set(['cardio', 'mi'])],
        ['cid', new Set(['mi'])],
      ]),
      examesPorMedico: new Map([
        ['coord', 100000],
        ['bia', 50000],
        ['cid', 999999],
      ]),
    });
    expect(extras.get('coord')?.[0]).toMatchObject({
      valorCentavos: 9000,
      descricao: 'Coordenação Cardiologia (6% de R$ 1.500,00)',
    });
  });

  it('resultado zero não entra', () => {
    const r = regra({ tipo: 'por_laudo', valorCentavos: 70 });
    expect(calcularExtras({ ...vazio, regras: [r] }).get('coord')).toBeUndefined();
  });

  it('a tarifa própria não é extra', () => {
    const r = regra({ tipo: 'tarifa_laudo', valorCentavos: 4700 });
    expect(calcularExtras({ ...vazio, regras: [r] }).size).toBe(0);
  });
});

describe('tarifasDasRegras', () => {
  it('a tarifa própria vigente de cada médico', () => {
    const t = tarifasDasRegras([
      regra({ tipo: 'tarifa_laudo', medicoId: 'ana', valorCentavos: 7549 }),
      regra({ tipo: 'fixo', medicoId: 'bia' }),
    ]);
    expect([...t]).toEqual([['ana', 7549]]);
  });
});
