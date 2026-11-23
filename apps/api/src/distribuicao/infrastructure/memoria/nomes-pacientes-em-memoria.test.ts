import { describe, expect, it } from 'vitest';

import { NomesPacientesEmMemoria } from './nomes-pacientes-em-memoria';

const H = 3_600_000;
const t0 = new Date('2026-11-23T12:00:00Z');
const depois = (ms: number) => new Date(t0.getTime() + ms);

describe('NomesPacientesEmMemoria', () => {
  it('guarda por rodada e junta os nomes novos aos que já tinha', () => {
    const c = new NomesPacientesEmMemoria(4 * H);
    c.guardar('r1', new Map([['9000001', 'Ana']]), t0);
    c.guardar('r1', new Map([['9000002', 'Bia']]), t0);
    c.guardar('r2', new Map([['9000003', 'Caio']]), t0);
    expect([...c.ler('r1', t0)]).toEqual([
      ['9000001', 'Ana'],
      ['9000002', 'Bia'],
    ]);
    expect(c.ler('r9', t0).size).toBe(0);
  });

  it('limpar esquece a rodada', () => {
    const c = new NomesPacientesEmMemoria(4 * H);
    c.guardar('r1', new Map([['9000001', 'Ana']]), t0);
    c.limpar('r1');
    expect(c.ler('r1', t0).size).toBe(0);
  });

  it('vence pelo teto de tempo desde a última gravação (e some de vez)', () => {
    const c = new NomesPacientesEmMemoria(4 * H);
    c.guardar('r1', new Map([['9000001', 'Ana']]), t0);
    expect(c.ler('r1', depois(4 * H - 1)).size).toBe(1);
    expect(c.ler('r1', depois(4 * H)).size).toBe(0);
    c.guardar('r2', new Map([['9000002', 'Bia']]), depois(5 * H));
    expect(c.rodadasGuardadas()).toEqual(['r2']);
  });
});
