import { describe, expect, it } from 'vitest';

import {
  alternarDiasUteis,
  CELULA_VAZIA,
  celula,
  celulasDaGrade,
  frentesComTurno,
  gradeDasCelulas,
  marcar,
  mesmaProdutividadeNaLinha,
  mudarProdutividade,
  previa,
  resumoDoResultado,
  turnosDaFrente,
} from './escala-fixa';
import { FRENTE_RM, FRENTE_TC, frenteDoTurno, turno } from './teste-dados';

const MANHA = turno();
const TARDE = turno({
  id: 't-tarde',
  nome: 'Tarde',
  ordem: 2,
  frentes: [frenteDoTurno(FRENTE_TC.id, FRENTE_TC.rotulo)],
});
const NOITE = turno({ id: 't-noite', nome: 'Noite', ordem: 3, frentes: [] });

describe('frentesComTurno e turnosDaFrente', () => {
  it('só frentes que algum turno tem; turnos da frente em ordem', () => {
    const outra = { id: 'f-x', rotulo: 'X', cor: null, ordem: 3 };
    expect(frentesComTurno([FRENTE_TC, FRENTE_RM, outra], [NOITE, TARDE, MANHA])).toEqual([
      FRENTE_TC,
      FRENTE_RM,
    ]);
    expect(turnosDaFrente([TARDE, NOITE, MANHA], 'f-tc').map((t) => t.id)).toEqual([
      't-manha',
      't-tarde',
    ]);
    expect(turnosDaFrente([TARDE, MANHA], 'f-rm').map((t) => t.id)).toEqual(['t-manha']);
  });
});

describe('grade ⇄ células', () => {
  it('monta a grade das células e devolve só as marcadas, em ordem', () => {
    const grade = gradeDasCelulas([
      { turnoId: 't-tarde', diaSemana: 0, produtividade: null },
      { turnoId: 't-manha', diaSemana: 5, produtividade: 30 },
      { turnoId: 't-manha', diaSemana: 1, produtividade: 30 },
    ]);
    expect(celula(grade, 't-manha', 1)).toEqual({ marcada: true, produtividade: 30 });
    expect(celula(grade, 't-manha', 2)).toEqual(CELULA_VAZIA);

    const desmarcada = marcar(grade, 't-manha', 5, false);
    // Desmarcar guarda o valor (volta se marcar de novo), mas a célula não vai para a API.
    expect(celula(desmarcada, 't-manha', 5)).toEqual({ marcada: false, produtividade: 30 });
    expect(celulasDaGrade(desmarcada)).toEqual([
      { turnoId: 't-manha', diaSemana: 1, produtividade: 30 },
      { turnoId: 't-tarde', diaSemana: 0, produtividade: null },
    ]);
  });

  it('muda a produtividade de uma célula (vazio = não informada)', () => {
    const grade = mudarProdutividade(marcar({}, 't-manha', 2, true), 't-manha', 2, 25);
    expect(celulasDaGrade(grade)).toEqual([
      { turnoId: 't-manha', diaSemana: 2, produtividade: 25 },
    ]);
    expect(celula(mudarProdutividade(grade, 't-manha', 2, null), 't-manha', 2).produtividade).toBe(
      null,
    );
  });
});

describe('atalhos da linha', () => {
  it('mesma produtividade: a da primeira marcada (seg antes de dom) vai às outras marcadas', () => {
    const grade = gradeDasCelulas([
      { turnoId: 't-manha', diaSemana: 0, produtividade: 10 },
      { turnoId: 't-manha', diaSemana: 2, produtividade: 30 },
      { turnoId: 't-manha', diaSemana: 4, produtividade: null },
      { turnoId: 't-tarde', diaSemana: 4, produtividade: 5 },
    ]);
    const nova = mesmaProdutividadeNaLinha(marcar(grade, 't-manha', 3, false), 't-manha');
    expect(celulasDaGrade(nova)).toEqual([
      { turnoId: 't-manha', diaSemana: 2, produtividade: 30 },
      { turnoId: 't-manha', diaSemana: 4, produtividade: 30 },
      { turnoId: 't-manha', diaSemana: 0, produtividade: 30 },
      { turnoId: 't-tarde', diaSemana: 4, produtividade: 5 },
    ]);
    // A desmarcada não muda.
    expect(celula(nova, 't-manha', 3).marcada).toBe(false);
  });

  it('seg–sex: marca todos se falta algum; desmarca se já estão todos', () => {
    const parcial = marcar({}, 't-manha', 3, true);
    const marcada = alternarDiasUteis(parcial, 't-manha');
    expect(celulasDaGrade(marcada).map((c) => c.diaSemana)).toEqual([1, 2, 3, 4, 5]);
    const comSabado = marcar(marcada, 't-manha', 6, true);
    expect(celulasDaGrade(alternarDiasUteis(comSabado, 't-manha')).map((c) => c.diaSemana)).toEqual(
      [6],
    );
  });
});

describe('previa', () => {
  it('agrupa por turno e produtividade igual, em ordem de turno e dia', () => {
    const itens = previa(
      [
        { turnoId: 't-tarde', diaSemana: 0, produtividade: null },
        { turnoId: 't-manha', diaSemana: 5, produtividade: 30 },
        { turnoId: 't-manha', diaSemana: 2, produtividade: 25 },
        { turnoId: 't-manha', diaSemana: 1, produtividade: 30 },
        { turnoId: 't-manha', diaSemana: 4, produtividade: 25 },
        { turnoId: 't-sumido', diaSemana: 3, produtividade: 1 },
      ],
      [TARDE, MANHA],
    );
    expect(itens.map((i) => i.texto)).toEqual([
      'Manhã · seg, sex · 30',
      'Manhã · ter, qui · 25',
      'Tarde · dom · produtividade não informada',
      'Turno fora da lista · qua · 1',
    ]);
  });
});

describe('resumoDoResultado', () => {
  it('diz o que mudou, no plural certo', () => {
    expect(
      resumoDoResultado({ criadas: 3, encerradas: 2, removidas: 0, mantidas: 1, avisos: [] }),
    ).toBe('3 alocações criadas, 2 encerradas.');
    expect(
      resumoDoResultado({ criadas: 0, encerradas: 1, removidas: 1, mantidas: 0, avisos: [] }),
    ).toBe('1 alocação encerrada, 1 removida.');
    expect(
      resumoDoResultado({ criadas: 0, encerradas: 0, removidas: 0, mantidas: 4, avisos: [] }),
    ).toBe('Nada mudou na escala.');
  });
});
