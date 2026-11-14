import { describe, expect, it } from 'vitest';

import { normalizarNomeMedico } from './nome-medico';

describe('normalizarNomeMedico', () => {
  it('tira acento, maiúsculas e espaços sobrando', () => {
    expect(normalizarNomeMedico('  Márcio   SOUSA ')).toBe('marcio sousa');
  });

  it('tira o prefixo Dr. ou Dra., com ou sem ponto e espaço', () => {
    expect(normalizarNomeMedico('Dr. Augusto Lima')).toBe('augusto lima');
    expect(normalizarNomeMedico('Dra Jainy Oliveira')).toBe('jainy oliveira');
    expect(normalizarNomeMedico('Dra.Tatyane Reis')).toBe('tatyane reis');
  });

  it('não come nome que começa com "dr"', () => {
    expect(normalizarNomeMedico('Drauzio Varella')).toBe('drauzio varella');
  });

  it('tira o que está entre parênteses', () => {
    expect(normalizarNomeMedico('Ana Paula (E2)')).toBe('ana paula');
  });

  it('junta apóstrofo e ponto, e troca outros sinais por espaço', () => {
    expect(normalizarNomeMedico("Carla D'Andréa")).toBe('carla dandrea');
    expect(normalizarNomeMedico('João N. Silva-Costa')).toBe('joao n silva costa');
  });
});
