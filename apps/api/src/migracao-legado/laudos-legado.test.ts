import { describe, expect, it } from 'vitest';

import { janelaDasCompetencias, registroDoLaudoLegado } from './laudos-legado';

describe('laudos do dashboards-one', () => {
  it('a linha crua da MobileMed que ele guardou, com as contas MobileMed das colunas dele', () => {
    expect(
      registroDoLaudoLegado({
        dadosBrutos: { EMPRESA: 'CLINICA X', IMAGENS_CHAVES: 0, DIGITADOR: null },
        medicoIdMobilemed: 123,
        medicoReassinaturaIdMobilemed: null,
      }),
    ).toEqual({
      EMPRESA: 'CLINICA X',
      IMAGENS_CHAVES: 0,
      DIGITADOR: null,
      MEDICO_ID: 123,
      MEDICO_REASSINATURA_ID: null,
    });
    // A conta que já veio na linha crua vale.
    expect(
      registroDoLaudoLegado({
        dadosBrutos: { MEDICO_ID: 7 },
        medicoIdMobilemed: 123,
        medicoReassinaturaIdMobilemed: 9,
      }),
    ).toEqual({ MEDICO_ID: 7, MEDICO_REASSINATURA_ID: 9 });
  });

  // O corte vai até um dia do próprio mês (o período começa no mês anterior) ou do seguinte.
  it('dias do laudo que podem cair nas competências: do mês anterior à primeira ao seguinte à última', () => {
    expect(janelaDasCompetencias(['2026-10', '2026-09'])).toEqual({
      inicio: '2026-08-01',
      fim: '2026-11-30',
    });
    expect(janelaDasCompetencias(['2026-01'])).toEqual({ inicio: '2025-12-01', fim: '2026-02-28' });
    expect(() => janelaDasCompetencias([])).toThrow();
    expect(() => janelaDasCompetencias(['2026-13'])).toThrow();
  });
});
