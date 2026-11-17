import { describe, expect, it } from 'vitest';

import { capacidadeNoInstante, juntarPeriodos } from './capacidade';

/** Instante de Brasília. */
const br = (dataHora: string) => new Date(`${dataHora}:00-03:00`);
const ANTECEDENCIA = 180;

const cap = (
  inicio: string,
  fim: string,
  produtividade: number | null,
  agora: string,
  turnoEscolhido = false,
) =>
  capacidadeNoInstante({ inicio: br(inicio), fim: br(fim), produtividade }, br(agora), {
    antecedenciaMin: ANTECEDENCIA,
    turnoEscolhido,
  });

describe('capacidadeNoInstante', () => {
  it('turno em curso vale a produtividade cheia (sem rateio pelo relógio)', () => {
    expect(cap('2026-10-27T07:00', '2026-10-27T13:00', 30, '2026-10-27T09:50').capacidade).toBe(30);
    expect(cap('2026-10-27T07:00', '2026-10-27T13:00', 296, '2026-10-27T11:00').capacidade).toBe(
      296,
    );
  });

  it('turno que começa dentro da antecedência entra cheio', () => {
    expect(cap('2026-10-27T07:00', '2026-10-27T13:00', 296, '2026-10-27T06:30').capacidade).toBe(
      296,
    );
    expect(cap('2026-10-27T13:00', '2026-10-27T19:00', 30, '2026-10-27T11:00').capacidade).toBe(30);
  });

  it('turno encerrado fica de fora', () => {
    const r = cap('2026-10-27T07:00', '2026-10-27T13:00', 296, '2026-10-27T13:30');
    expect(r).toEqual({ capacidade: 0, entra: false });
  });

  it('turno além da antecedência é do período seguinte, salvo se marcado no filtro da rodada', () => {
    expect(cap('2026-10-27T13:00', '2026-10-27T19:00', 30, '2026-10-27T06:30').entra).toBe(false);
    expect(
      cap('2026-10-27T13:00', '2026-10-27T19:00', 30, '2026-10-27T06:30', true).capacidade,
    ).toBe(30);
    expect(cap('2026-10-27T07:00', '2026-10-27T13:00', 30, '2026-10-27T13:30', true).entra).toBe(
      false,
    );
  });

  it('Lista de 24h: o turno de ontem segue em curso e o de hoje começa em breve; os dois cheios', () => {
    expect(cap('2026-10-26T07:00', '2026-10-27T07:00', 8, '2026-10-27T06:30').capacidade).toBe(8);
    expect(cap('2026-10-27T07:00', '2026-10-28T07:00', 8, '2026-10-27T06:30').capacidade).toBe(8);
    expect(cap('2026-10-26T07:00', '2026-10-27T07:00', 100, '2026-10-27T03:00').capacidade).toBe(
      100,
    );
  });

  it('depois da meia-noite vale o plantão de ontem (o legado usava a ocorrência de hoje)', () => {
    // Plantão de segunda 19:00 → terça 07:00, consultado à 00:30 de terça.
    expect(cap('2026-10-26T19:00', '2026-10-27T07:00', 24, '2026-10-27T00:30').entra).toBe(true);
    // A ocorrência de terça (19:00) ainda está a 18h30: fora.
    expect(cap('2026-10-27T19:00', '2026-10-28T07:00', 24, '2026-10-27T00:30').entra).toBe(false);
  });

  it('produtividade desconhecida não é zero: entra sem teto (null)', () => {
    expect(cap('2026-10-27T07:00', '2026-10-27T13:00', null, '2026-10-27T08:00')).toEqual({
      capacidade: null,
      entra: true,
    });
  });
});

describe('juntarPeriodos', () => {
  it('escala dele + cobertura somam', () => {
    expect(juntarPeriodos([{ valor: 20 }, { coberturaDe: 'Ana', valor: 25 }])).toBe(45);
  });

  it('no mesmo turno vale o maior; turnos diferentes somam (Jainy: Tarde 30 + Lista 100)', () => {
    expect(juntarPeriodos([{ valor: 20 }, { valor: 30 }])).toBe(30);
    expect(
      juntarPeriodos([
        { turnoId: 'manha', valor: 25 },
        { turnoId: 'manha', valor: 25 },
      ]),
    ).toBe(25);
    expect(
      juntarPeriodos([
        { turnoId: 'tarde', valor: 30 },
        { turnoId: 'lista', valor: 100 },
      ]),
    ).toBe(130);
    expect(
      juntarPeriodos([
        { turnoId: 'tarde', valor: 30 },
        { turnoId: 'lista', valor: 100 },
        { coberturaDe: 'Ana', turnoId: 'tarde', valor: 25 },
      ]),
    ).toBe(155);
  });

  it('dois titulares cobertos somam; dois períodos do mesmo titular, o maior', () => {
    expect(
      juntarPeriodos([
        { valor: 10 },
        { coberturaDe: 'Ana', valor: 25 },
        { coberturaDe: 'Ana', valor: 15 },
        { coberturaDe: 'Bia', valor: 5 },
      ]),
    ).toBe(40);
  });

  it('não informado não soma nem zera; tudo vazio é "sem teto"', () => {
    expect(juntarPeriodos([{ valor: null }, { coberturaDe: 'Ana', valor: 25 }])).toBe(25);
    expect(juntarPeriodos([{ valor: null }])).toBeNull();
  });
});
