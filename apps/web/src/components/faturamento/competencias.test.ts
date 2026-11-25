import { describe, expect, it } from 'vitest';

import type { CompetenciaDto } from '../../gen/types/CompetenciaDto';
import { acoesDaCompetencia, mesAno } from './competencias';

const base: CompetenciaDto = {
  competencia: '2026-10',
  status: 'aberta',
  fechadaEm: null,
  fechadaPor: null,
  reabertaEm: null,
  reabertaPor: null,
  importacaoTravadaEm: null,
  importacaoTravadaPor: null,
  observacoes: null,
  fechadaComAvisosMotivo: null,
  laudos: 41230,
  volume: 45876,
};

// 12:00 em Brasília; a competência corrente é 11/2026.
const AGORA = new Date('2026-11-24T15:00:00.000Z');
const TUDO = { acessoTotal: true, permissoes: [] };
const so = (...permissoes: string[]) => ({ acessoTotal: false, permissoes });
const tipos = (acoes: { tipo: string }[]) => acoes.map((a) => a.tipo);

describe('mesAno', () => {
  it('mostra a competência como MM/AAAA', () => {
    expect(mesAno('2026-10')).toBe('10/2026');
    expect(mesAno('2025-01')).toBe('01/2025');
  });
});

describe('acoesDaCompetencia', () => {
  it('aberta e destravada: fechar e travar', () => {
    expect(tipos(acoesDaCompetencia(base, TUDO, AGORA))).toEqual(['fechar', 'travar']);
  });

  it('fechada e travada: reabrir e destravar', () => {
    const c = { ...base, status: 'fechada' as const, importacaoTravadaEm: '2026-11-10T13:00:00Z' };
    expect(tipos(acoesDaCompetencia(c, TUDO, AGORA))).toEqual(['reabrir', 'destravar']);
  });

  it('cada ação exige a sua permissão; sem nenhuma, nada aparece', () => {
    expect(tipos(acoesDaCompetencia(base, so('faturamento.competencia.fechar'), AGORA))).toEqual([
      'fechar',
    ]);
    expect(tipos(acoesDaCompetencia(base, so('faturamento.competencia.travar'), AGORA))).toEqual([
      'travar',
    ]);
    const fechada = { ...base, status: 'fechada' as const };
    expect(
      tipos(acoesDaCompetencia(fechada, so('faturamento.competencia.reabrir'), AGORA)),
    ).toEqual(['reabrir']);
    expect(acoesDaCompetencia(base, so('faturamento.ver'), AGORA)).toEqual([]);
  });

  it('a confirmação diz a competência, a consequência e o nome da ação', () => {
    const [fechar, travar] = acoesDaCompetencia(base, TUDO, AGORA);
    expect(fechar).toMatchObject({
      rotulo: 'Fechar competência',
      titulo: 'Fechar a competência 10/2026?',
      sucesso: 'Competência 10/2026 fechada.',
      falha: 'Não foi possível fechar a competência 10/2026.',
    });
    expect(fechar?.consequencia).toContain('41.230 laudos');
    expect(fechar?.consequencia).toContain('Dá para reabrir depois');
    expect(travar).toMatchObject({
      rotulo: 'Travar importação',
      titulo: 'Travar a importação de 10/2026?',
      sucesso: 'Importação de 10/2026 travada.',
      falha: 'Não foi possível travar a importação de 10/2026.',
    });
  });

  it('reabrir avisa que a trava da importação continua, quando houver', () => {
    const fechada = { ...base, status: 'fechada' as const };
    const [semTrava] = acoesDaCompetencia(fechada, TUDO, AGORA);
    expect(semTrava?.consequencia).not.toContain('continua travada');
    const [comTrava] = acoesDaCompetencia(
      { ...fechada, importacaoTravadaEm: '2026-11-10T13:00:00Z' },
      TUDO,
      AGORA,
    );
    expect(comTrava?.consequencia).toContain('continua travada');
  });

  it('destravar a fechada avisa que ela continua fora da importação', () => {
    const travada = { ...base, importacaoTravadaEm: '2026-11-10T13:00:00Z' };
    const [, aberta] = acoesDaCompetencia(travada, TUDO, AGORA);
    expect(aberta?.consequencia).toBe('A importação volta a atualizar os laudos de 10/2026.');
    const [, fechada] = acoesDaCompetencia({ ...travada, status: 'fechada' }, TUDO, AGORA);
    expect(fechada?.consequencia).toContain('continua fechada');
  });

  it('fechar fica desativado, com o motivo, até o mês acabar em Brasília', () => {
    const corrente = { ...base, competencia: '2026-11' };
    const [fechar] = acoesDaCompetencia(corrente, TUDO, AGORA);
    expect(fechar).toMatchObject({
      tipo: 'fechar',
      desabilitada: 'O mês ainda não acabou: dá para fechar a partir de 01/12/2026.',
    });
    // Travar segue valendo no mês corrente.
    expect(acoesDaCompetencia(corrente, TUDO, AGORA)[1]?.desabilitada).toBeUndefined();
    expect(acoesDaCompetencia(base, TUDO, AGORA)[0]?.desabilitada).toBeUndefined();
  });

  it('na virada, vale o mês de Brasília: 02:00 UTC de 01/12 ainda é novembro', () => {
    const corrente = { ...base, competencia: '2026-11' };
    const [antes] = acoesDaCompetencia(corrente, TUDO, new Date('2026-12-01T02:00:00Z'));
    expect(antes?.desabilitada).toBeDefined();
    const [depois] = acoesDaCompetencia(corrente, TUDO, new Date('2026-12-01T03:00:00Z'));
    expect(depois?.desabilitada).toBeUndefined();
  });

  it('dezembro vira para janeiro do ano seguinte no motivo', () => {
    const dezembro = { ...base, competencia: '2026-12' };
    const [fechar] = acoesDaCompetencia(dezembro, TUDO, new Date('2026-12-15T15:00:00Z'));
    expect(fechar?.desabilitada).toBe(
      'O mês ainda não acabou: dá para fechar a partir de 01/01/2027.',
    );
  });

  it('cada ação diz o que está fazendo enquanto roda', () => {
    const travada = { ...base, importacaoTravadaEm: '2026-11-10T13:00:00Z' };
    expect(acoesDaCompetencia(base, TUDO, AGORA).map((a) => a.andamento)).toEqual([
      'Fechando…',
      'Travando…',
    ]);
    expect(
      acoesDaCompetencia({ ...travada, status: 'fechada' }, TUDO, AGORA).map((a) => a.andamento),
    ).toEqual(['Reabrindo…', 'Destravando…']);
  });
});
