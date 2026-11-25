import { describe, expect, it } from 'vitest';

import { esquemaCobertura, paraApiCobertura, valoresCobertura } from './cobertura-form';

const titular = {
  medicoId: 'm1',
  diasSemana: [1, 3],
  horarioInicio: '07:00',
  horarioFim: '13:00',
  produtividade: 40 as number | null,
  dataInicio: '2026-11-02',
  dataFim: '2026-12-31' as string | null,
};

describe('valoresCobertura', () => {
  it('nova: começa no dia clicado, com dias, horário e produtividade do titular', () => {
    expect(valoresCobertura({ titular, dia: '2026-11-18' })).toEqual({
      medico: null,
      dataInicio: '2026-11-18',
      dataFim: '2026-11-18',
      diasSemana: ['1', '3'],
      horarioInicio: '07:00',
      horarioFim: '13:00',
      produtividade: '40',
      observacoes: '',
    });
  });
});

const erros = (valores: object) =>
  esquemaCobertura(titular)
    .safeParse(valores)
    .error?.issues.map((i) => i.message) ?? [];

const validos = {
  ...valoresCobertura({ titular, dia: '2026-11-18' }),
  medico: { valor: 'm2', rotulo: 'Bruno' },
};

describe('esquemaCobertura', () => {
  it('aceita o mínimo', () => {
    expect(erros(validos)).toEqual([]);
  });

  it('quem cobre não pode ser o titular; precisa de um dia', () => {
    expect(erros({ ...validos, medico: { valor: 'm1', rotulo: 'Ana' }, diasSemana: [] })).toEqual([
      'Escolha outro médico: o titular não cobre a si mesmo.',
      'Marque ao menos um dia.',
    ]);
    expect(erros({ ...validos, medico: null })).toEqual(['Escolha quem cobre.']);
  });

  it('período dentro da vigência do titular', () => {
    expect(erros({ ...validos, dataInicio: '2026-11-01' })).toEqual([
      'Comece em 02/11/2026 ou depois: antes disso o titular não está na escala.',
    ]);
    expect(erros({ ...validos, dataFim: '2027-01-02' })).toEqual([
      'Termine até 31/12/2026: depois disso o titular não está na escala.',
    ]);
    expect(erros({ ...validos, dataFim: '2026-11-17' })).toEqual([
      'O fim não pode ser antes do início.',
    ]);
  });
});

describe('paraApiCobertura', () => {
  it('manda dias em número e vazios como nulo', () => {
    expect(paraApiCobertura({ ...validos, produtividade: '', observacoes: ' ' })).toEqual({
      medicoId: 'm2',
      dataInicio: '2026-11-18',
      dataFim: '2026-11-18',
      todosOsDias: false,
      diasSemana: [1, 3],
      horarioInicio: '07:00',
      horarioFim: '13:00',
      produtividade: null,
      observacoes: null,
    });
  });
});
