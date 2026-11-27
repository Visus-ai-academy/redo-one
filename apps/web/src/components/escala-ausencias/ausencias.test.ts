import { describe, expect, it } from 'vitest';

import type { AusenciaItemDto } from '../../gen/types/AusenciaItemDto';
import {
  buscaAoFecharPainel,
  diaCurto,
  diasDaSemana,
  hojeEmBrasilia,
  periodoDaAusencia,
  recorteDaAusencia,
  situacaoDaAusencia,
  somarDias,
} from './ausencias';

const base: AusenciaItemDto = {
  id: 'a-1',
  medico: { id: 'm-1', nome: 'Ana Lima' },
  tipo: { id: 't-1', nome: 'Férias', cor: '#1F7A4D' },
  dataInicio: '2026-12-01',
  dataFim: '2026-12-10',
  todosDias: true,
  diasSemana: [],
  todasFrentes: true,
  frentes: [],
  todosTurnos: true,
  turnos: [],
  situacao: 'aprovada',
  origem: 'gestor',
  observacoes: null,
  temObservacoes: false,
  motivoRecusa: null,
  revisadaEm: null,
  criadoEm: '2026-11-10T12:00:00.000Z',
  solicitadaPor: null,
  revisadaPor: null,
};

describe('hojeEmBrasilia', () => {
  it('usa o dia de Brasília, não o de UTC', () => {
    // 02:00 UTC do dia 17 ainda é dia 16 em Brasília (UTC−3).
    expect(hojeEmBrasilia(new Date('2026-11-17T02:00:00Z'))).toBe('2026-11-16');
    expect(hojeEmBrasilia(new Date('2026-11-17T03:00:00Z'))).toBe('2026-11-17');
  });
});

describe('somarDias', () => {
  it('atravessa mês e ano', () => {
    expect(somarDias('2026-12-25', 7)).toBe('2027-01-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('diaCurto', () => {
  it('omite o ano corrente e mostra os outros', () => {
    expect(diaCurto('2026-12-01', '2026-11-16')).toBe('01/12');
    expect(diaCurto('2027-01-05', '2026-11-16')).toBe('05/01/2027');
  });
});

describe('periodoDaAusencia', () => {
  it('um dia só aparece uma vez', () => {
    expect(
      periodoDaAusencia({ dataInicio: '2026-12-01', dataFim: '2026-12-01' }, '2026-11-16'),
    ).toBe('01/12');
  });
  it('início e fim com travessão', () => {
    expect(periodoDaAusencia(base, '2026-11-16')).toBe('01/12 – 10/12');
  });
});

describe('diasDaSemana', () => {
  it('ordena de segunda a domingo, abreviado', () => {
    expect(diasDaSemana([0, 3, 1])).toBe('seg, qua, dom');
  });
});

describe('recorteDaAusencia', () => {
  it('sem recorte, nada', () => {
    expect(recorteDaAusencia(base)).toEqual([]);
  });
  it('dias, turnos e escalas, cada um na sua frase', () => {
    expect(
      recorteDaAusencia({
        ...base,
        todosDias: false,
        todosTurnos: false,
        todasFrentes: false,
        diasSemana: [3, 1],
        turnos: [{ id: 'tu-1', nome: 'Tarde' }],
        frentes: [
          { id: 'f-1', nome: 'NEURO' },
          { id: 'f-2', nome: 'TC' },
        ],
      }),
    ).toEqual(['só seg, qua', 'só Tarde', 'só NEURO, TC']);
  });
  it('sem "todos" e com o recorte vazio, diz que não vale em nada', () => {
    expect(
      recorteDaAusencia({ ...base, todosDias: false, todosTurnos: false, todasFrentes: false }),
    ).toEqual(['nenhum dia', 'nenhum turno', 'nenhuma escala']);
  });
  it('os 7 dias marcados valem todos os dias: sem recorte de dia', () => {
    expect(recorteDaAusencia({ ...base, diasSemana: [0, 1, 2, 3, 4, 5, 6] })).toEqual([]);
  });
});

describe('buscaAoFecharPainel', () => {
  it('fecha o painel e mantém os filtros da lista', () => {
    expect(
      buscaAoFecharPainel({
        busca: 'ana',
        de: '2026-12-01',
        frenteId: 'f-1',
        id: 'a-1',
        editar: 1,
      }),
    ).toEqual({ busca: 'ana', de: '2026-12-01', frenteId: 'f-1' });
  });
  it('vindo do pré-preenchimento (novo com médico), solta também o dia e a escala que vieram junto', () => {
    expect(
      buscaAoFecharPainel({
        situacao: 'aprovada',
        novo: 1,
        medicoId: 'm-1',
        turnoId: 'tu-1',
        de: '2026-12-07',
        frenteId: 'f-1',
      }),
    ).toEqual({ situacao: 'aprovada' });
  });
  it('"Nova ausência" comum (sem médico) mantém o período e a escala filtrados', () => {
    expect(buscaAoFecharPainel({ novo: 1, de: '2026-12-07', frenteId: 'f-1' })).toEqual({
      de: '2026-12-07',
      frenteId: 'f-1',
    });
  });
});

describe('situacaoDaAusencia', () => {
  it('nomes e tons fixos', () => {
    expect(situacaoDaAusencia('pendente')).toEqual({ texto: 'Pendente', tom: 'atencao' });
    expect(situacaoDaAusencia('aprovada')).toEqual({ texto: 'Aprovada', tom: 'sucesso' });
    expect(situacaoDaAusencia('recusada')).toEqual({ texto: 'Recusada', tom: 'inativo' });
  });
});
