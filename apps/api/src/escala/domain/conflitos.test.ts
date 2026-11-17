import { describe, expect, it } from 'vitest';

import { conflitosDoMedico, type OcorrenciaComIntervalo } from './conflitos';

function oc(
  alocacaoId: string,
  inicio: string,
  fim: string,
  over: Partial<OcorrenciaComIntervalo> = {},
) {
  return {
    alocacaoId,
    medicoId: 'ana',
    turnoId: 'manha',
    data: inicio.slice(0, 10),
    inicio,
    fim,
    ausente: false,
    ...over,
  };
}

const t = (dia: string, hora: string) => `2026-11-${dia}T${hora}:00-03:00`;

describe('conflitosDoMedico', () => {
  it('acha o par do mesmo médico com horários sobrepostos', () => {
    const manha = oc('manha', t('02', '07:00'), t('02', '13:00'));
    const extra = oc('extra', t('02', '12:00'), t('02', '18:00'));
    expect(conflitosDoMedico([manha, extra])).toEqual([{ medicoId: 'ana', a: manha, b: extra }]);
  });

  it('turnos diferentes no mesmo horário não conflitam (ex.: Tarde dentro da Lista de 24 h)', () => {
    const lista = oc('lista', t('17', '07:00'), t('18', '07:00'), { turnoId: 'lista' });
    const tarde = oc('tarde', t('17', '13:00'), t('17', '19:00'), { turnoId: 'tarde' });
    expect(conflitosDoMedico([lista, tarde])).toEqual([]);
  });

  it('encostar não é sobrepor (intervalo [inicio, fim))', () => {
    const manha = oc('manha', t('02', '07:00'), t('02', '13:00'));
    const tarde = oc('tarde', t('02', '13:00'), t('02', '19:00'));
    expect(conflitosDoMedico([manha, tarde])).toEqual([]);
  });

  it('pega a virada da meia-noite e a Lista de 24 h em dias seguidos sem falso conflito', () => {
    const noite = oc('noite', t('02', '19:00'), t('03', '07:00'), { turnoId: 'noite' });
    const madrugada = oc('extra', t('03', '06:00'), t('03', '10:00'), { turnoId: 'noite' });
    const lista1 = oc('lista', t('04', '07:00'), t('05', '07:00'), { turnoId: 'lista' });
    const lista2 = oc('lista', t('05', '07:00'), t('06', '07:00'), { turnoId: 'lista' });
    expect(conflitosDoMedico([lista2, noite, lista1, madrugada])).toEqual([
      { medicoId: 'ana', a: noite, b: madrugada },
    ]);
  });

  it('médicos diferentes no mesmo horário não conflitam', () => {
    const ana = oc('a', t('02', '07:00'), t('02', '13:00'));
    const bia = oc('b', t('02', '07:00'), t('02', '13:00'), { medicoId: 'bia' });
    expect(conflitosDoMedico([ana, bia])).toEqual([]);
  });

  it('ignora ocorrência ausente (coberta ou com ausência): o médico não está lá', () => {
    const coberta = oc('a', t('02', '07:00'), t('02', '13:00'), { ausente: true });
    const outra = oc('b', t('02', '08:00'), t('02', '12:00'));
    expect(conflitosDoMedico([coberta, outra])).toEqual([]);
  });

  it('lista todos os pares de um bloco sobreposto', () => {
    const a = oc('a', t('02', '07:00'), t('02', '19:00'));
    const b = oc('b', t('02', '08:00'), t('02', '09:00'));
    const c = oc('c', t('02', '10:00'), t('02', '11:00'));
    expect(conflitosDoMedico([c, b, a]).map((p) => [p.a.alocacaoId, p.b.alocacaoId])).toEqual([
      ['a', 'b'],
      ['a', 'c'],
    ]);
  });
});
