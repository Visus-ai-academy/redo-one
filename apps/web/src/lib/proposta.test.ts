import { describe, expect, it } from 'vitest';

import { designacaoDeTeste, medicoDaRodada } from '../components/rodada/teste-dados';
import { agruparProposta, turnoDoMedico } from './proposta';

const NEURO: Frente = { id: 'f-neuro', nome: 'NEURO', cor: '#5B7DB1' };
const CT: Frente = { id: 'f-ct', nome: 'CT', cor: null };
type Frente = { id: string; nome: string; cor: string | null };
const exame = (id: string, medicoId: string, frente: Frente | null, urgente = false) =>
  designacaoDeTeste({
    id,
    ordem: Number(id.replace(/\D/g, '')),
    medico: { id: medicoId, nome: medicoId },
    frente,
    urgente,
  });

describe('agruparProposta', () => {
  const medicos = [
    medicoDaRodada('ana', 'Ana', { previstas: 3 }),
    medicoDaRodada('bia', 'Bia', { previstas: 1 }),
    medicoDaRodada('caio', 'Caio', { previstas: 0 }),
  ];

  it('agrupa por frente e, dentro dela, por médico; cada exame aparece uma vez', () => {
    const frentes = agruparProposta(
      [
        exame('d1', 'ana', NEURO, true),
        exame('d2', 'bia', CT),
        exame('d3', 'ana', NEURO),
        exame('d4', 'ana', CT),
      ],
      medicos,
    );
    expect(frentes.map((f) => [f.nome, f.exames, f.urgentes])).toEqual([
      ['NEURO', 2, 1],
      ['CT', 2, 0],
    ]);
    const [neuro, ct] = frentes;
    expect(neuro?.medicos.map((m) => [m.medico.nome, m.exames.map((d) => d.id)])).toEqual([
      ['Ana', ['d1', 'd3']],
    ]);
    // Ana está nas duas frentes: em cada uma, só os exames dela; e o aviso de quantos tem na outra.
    expect(ct?.medicos.map((m) => [m.medico.nome, m.exames.length, m.emOutrasFrentes])).toEqual([
      ['Ana', 1, 2],
      ['Bia', 1, 0],
    ]);
    expect(neuro?.cor).toBe('#5B7DB1');
    expect(neuro?.maior).toBe(2);
  });

  it('médico sem exame proposto não aparece', () => {
    const frentes = agruparProposta([exame('d1', 'ana', NEURO)], medicos);
    const nomes = frentes.flatMap((f) => f.medicos.map((m) => m.medico.nome));
    expect(nomes).toEqual(['Ana']);
  });

  it('médicos do maior para o menor; "Sem frente" por último', () => {
    const frentes = agruparProposta(
      [
        exame('d1', 'bia', null),
        exame('d2', 'bia', null),
        exame('d3', 'bia', null),
        exame('d4', 'ana', NEURO),
        exame('d5', 'bia', NEURO),
        exame('d6', 'bia', NEURO),
      ],
      medicos,
    );
    expect(frentes.map((f) => f.nome)).toEqual(['NEURO', 'Sem frente']);
    expect(frentes[0]?.medicos.map((m) => m.medico.nome)).toEqual(['Bia', 'Ana']);
  });

  it('quem recebeu na conferência e não está no resumo entra com o nome do exame', () => {
    const frentes = agruparProposta([exame('d1', 'davi', NEURO)], medicos);
    expect(frentes[0]?.medicos[0]?.medico).toMatchObject({
      medicoId: 'davi',
      nome: 'davi',
      turnos: [],
    });
  });
});

describe('turnoDoMedico', () => {
  const incluidos: string[] = ['inc'];

  it('o turno em andamento e o que ainda vai começar, com a hora', () => {
    const m = medicoDaRodada('a', 'A', {
      turnos: ['Manhã'],
      aComecar: [{ turno: 'Tarde', inicio: '2026-11-18T16:00:00Z' }],
    });
    expect(turnoDoMedico(m, incluidos)).toBe('Manhã e Tarde (começa 13:00)');
  });

  it('só a começar', () => {
    const m = medicoDaRodada('a', 'A', {
      turnos: [],
      aComecar: [{ turno: 'Tarde', inicio: '2026-11-18T16:00:00Z' }],
    });
    expect(turnoDoMedico(m, incluidos)).toBe('Tarde (começa 13:00)');
  });

  it('sem turno no dia: diz por que está na rodada, nunca "Fora de turno"', () => {
    const vazio = { turnos: [], aComecar: [] };
    expect(turnoDoMedico(medicoDaRodada('inc', 'I', vazio), incluidos)).toBe('Incluído na rodada');
    expect(turnoDoMedico(medicoDaRodada('x', 'X', { ...vazio, naMao: 2 }), incluidos)).toBe(
      'Atribuído na conferência',
    );
    expect(turnoDoMedico(medicoDaRodada('y', 'Y', vazio), incluidos)).toBe('Sem turno hoje');
  });
});
