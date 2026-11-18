import { describe, expect, it } from 'vitest';

import { type AmostraCatalogo, gerarFilaSintetica } from './fila-sintetica';

const amostra: AmostraCatalogo = {
  exames: [
    { nome: 'RM CRANIO', modalidade: 'MR', especialidade: 'NEURO' },
    { nome: 'RM COLUNA LOMBAR', modalidade: 'MR', especialidade: 'NEURO' },
    { nome: 'TC TORAX', modalidade: 'CT', especialidade: 'TORAX' },
    { nome: 'TC ABDOME', modalidade: 'CT', especialidade: 'ABDOME' },
    { nome: 'RX TORAX PA', modalidade: 'CR', especialidade: null },
  ],
  clientes: ['HOSPITAL A', 'CLINICA B', 'CLINICA C'],
  medicosMobilemed: [101, 102, 103],
};
const base = new Date('2026-11-18T12:00:00Z');
const gerar = (tamanho = 1000, semente = 7) =>
  gerarFilaSintetica({ amostra, tamanho, semente, base });

describe('fila sintética da MobileMed', () => {
  it('é determinística pela semente: mesma semente, mesma fila; outra semente, outra', () => {
    expect(gerar()).toEqual(gerar());
    expect(gerar(1000, 8).semMedico.map((e) => e.estudo)).not.toEqual(
      gerar().semMedico.map((e) => e.estudo),
    );
  });

  it('tem o tamanho pedido, com ids únicos e exames e clientes do catálogo', () => {
    const { semMedico } = gerar(300);
    expect(semMedico).toHaveLength(300);
    expect(new Set(semMedico.map((e) => e.idExame)).size).toBe(300);
    const nomes = new Set(amostra.exames.map((e) => e.nome));
    expect(semMedico.filter((e) => nomes.has(e.estudo)).length).toBeGreaterThan(270);
    expect(semMedico.filter((e) => amostra.clientes.includes(e.unidade)).length).toBeGreaterThan(
      270,
    );
  });

  it('distribui as prioridades como a produção: Rotina ~80%, Plantão e Urgência ~10%', () => {
    const { semMedico } = gerar(2000);
    const parte = (...grafias: string[]) =>
      semMedico.filter((e) => grafias.includes(e.prioridade ?? '')).length / semMedico.length;
    expect(parte('Rotina')).toBeGreaterThan(0.7);
    expect(parte('Rotina')).toBeLessThan(0.85);
    expect(parte('Plantão')).toBeGreaterThan(0.06);
    expect(parte('Urgência', 'Emergência')).toBeGreaterThan(0.06);
    expect(parte('Ambulatório')).toBeGreaterThan(0);
    expect(parte('Internado')).toBeGreaterThan(0);
    expect(parte('Ambulatório', 'Internado')).toBeLessThan(0.08);
  });

  it('dá prazo plausível por prioridade: urgência em horas, rotina em dias', () => {
    const { semMedico } = gerar(2000);
    const horas = (grafia: string) =>
      semMedico
        .filter((e) => e.prioridade === grafia && e.prazo)
        .map((e) => ((e.prazo?.getTime() ?? 0) - e.realizadoEm.getTime()) / 3_600_000);
    expect(Math.max(...horas('Urgência'))).toBeLessThanOrEqual(4);
    expect(Math.min(...horas('Rotina'))).toBeGreaterThanOrEqual(48);
    expect(horas('Internado').every((h) => h === 24)).toBe(true);
  });

  it('põe pacientes com 2+ exames da mesma especialidade', () => {
    const { semMedico } = gerar(500);
    const contagem = new Map<string, number>();
    for (const e of semMedico) {
      const k = `${e.paciente.codigo}|${e.especialidade}`;
      contagem.set(k, (contagem.get(k) ?? 0) + 1);
    }
    expect([...contagem.values()].filter((n) => n >= 2).length).toBeGreaterThan(10);
  });

  it('gera recusas: cliente sem cadastro, estudo fora do catálogo e status diferente de NOVO', () => {
    const { semMedico } = gerar(1000);
    const nomes = new Set(amostra.exames.map((e) => e.nome));
    expect(semMedico.some((e) => !amostra.clientes.includes(e.unidade))).toBe(true);
    expect(semMedico.some((e) => !nomes.has(e.estudo))).toBe(true);
    expect(semMedico.some((e) => e.status !== 'NOVO')).toBe(true);
  });

  it('traz exames em mãos dos médicos da amostra (carga e aderência)', () => {
    const { emMaos } = gerar(400);
    expect(emMaos.length).toBeGreaterThan(0);
    expect(emMaos.every((e) => amostra.medicosMobilemed.includes(e.medicoIdMobilemed))).toBe(true);
  });

  it('sem médico com conta na MobileMed, ninguém tem exame em mãos', () => {
    const { emMaos } = gerarFilaSintetica({
      amostra: { ...amostra, medicosMobilemed: [] },
      tamanho: 100,
      semente: 1,
      base,
    });
    expect(emMaos).toEqual([]);
  });
});
