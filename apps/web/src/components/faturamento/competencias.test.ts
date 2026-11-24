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
  laudos: 41230,
  volume: 45876,
};

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
    expect(tipos(acoesDaCompetencia(base, TUDO))).toEqual(['fechar', 'travar']);
  });

  it('fechada e travada: reabrir e destravar', () => {
    const c = { ...base, status: 'fechada' as const, importacaoTravadaEm: '2026-11-10T13:00:00Z' };
    expect(tipos(acoesDaCompetencia(c, TUDO))).toEqual(['reabrir', 'destravar']);
  });

  it('cada ação exige a sua permissão; sem nenhuma, nada aparece', () => {
    expect(tipos(acoesDaCompetencia(base, so('faturamento.competencia.fechar')))).toEqual([
      'fechar',
    ]);
    expect(tipos(acoesDaCompetencia(base, so('faturamento.competencia.travar')))).toEqual([
      'travar',
    ]);
    const fechada = { ...base, status: 'fechada' as const };
    expect(tipos(acoesDaCompetencia(fechada, so('faturamento.competencia.reabrir')))).toEqual([
      'reabrir',
    ]);
    expect(acoesDaCompetencia(base, so('faturamento.ver'))).toEqual([]);
  });

  it('a confirmação diz a competência, a consequência e o nome da ação', () => {
    const [fechar, travar] = acoesDaCompetencia(base, TUDO);
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
    const [semTrava] = acoesDaCompetencia(fechada, TUDO);
    expect(semTrava?.consequencia).not.toContain('continua travada');
    const [comTrava] = acoesDaCompetencia(
      { ...fechada, importacaoTravadaEm: '2026-11-10T13:00:00Z' },
      TUDO,
    );
    expect(comTrava?.consequencia).toContain('continua travada');
  });

  it('destravar a fechada avisa que ela continua fora da importação', () => {
    const travada = { ...base, importacaoTravadaEm: '2026-11-10T13:00:00Z' };
    const [, aberta] = acoesDaCompetencia(travada, TUDO);
    expect(aberta?.consequencia).toBe('A importação volta a atualizar os laudos de 10/2026.');
    const [, fechada] = acoesDaCompetencia({ ...travada, status: 'fechada' }, TUDO);
    expect(fechada?.consequencia).toContain('continua fechada');
  });
});
